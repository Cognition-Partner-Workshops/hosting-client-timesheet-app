import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as fs from "fs";
import * as path from "path";

// Configuration
const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");
const awsRegion = awsConfig.require("region");
const environment = config.get("environment") ?? "production";
const instanceType = config.get("instanceType") ?? "t3.micro";
const ecrRepositoryUrl = config.require("ecrRepositoryUrl");
const ecrRepositoryArn = config.require("ecrRepositoryArn");
const appPort = config.getNumber("appPort") ?? 3001;

// Common tags
const tags = {
    Environment: environment,
    Project: "client-timesheet-app",
    ManagedBy: "pulumi",
};

// Get availability zones
const availabilityZones = aws.getAvailabilityZones({
    state: "available",
});

// Get latest Amazon Linux 2023 AMI
const amazonLinux2023Ami = aws.ec2.getAmi({
    mostRecent: true,
    owners: ["amazon"],
    filters: [
        {
            name: "name",
            values: ["al2023-ami-*-x86_64"],
        },
        {
            name: "virtualization-type",
            values: ["hvm"],
        },
    ],
});

// =============================================================================
// VPC and Networking (using default VPC)
// =============================================================================

const defaultVpc = new aws.ec2.DefaultVpc("defaultVpc", {
    tags: {
        Name: "Default VPC",
    },
});

const defaultSubnet = availabilityZones.then(azs => 
    new aws.ec2.DefaultSubnet("defaultSubnet", {
        availabilityZone: azs.names[0],
        tags: {
            Name: "Default Subnet",
        },
    })
);

// =============================================================================
// Security Group
// =============================================================================

const appSecurityGroup = new aws.ec2.SecurityGroup("appSecurityGroup", {
    name: "client-timesheet-app-sg",
    description: "Security group for Client Timesheet App",
    vpcId: defaultVpc.id,
    ingress: [
        {
            description: "HTTP",
            fromPort: 80,
            toPort: 80,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
        },
        {
            description: "HTTPS",
            fromPort: 443,
            toPort: 443,
            protocol: "tcp",
            cidrBlocks: ["0.0.0.0/0"],
        },
    ],
    egress: [{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
    }],
    tags: {
        ...tags,
        Name: "client-timesheet-app-sg",
    },
});

// =============================================================================
// IAM Role for EC2
// =============================================================================

const ec2Role = new aws.iam.Role("ec2Role", {
    name: "client-timesheet-ec2-role",
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
                Service: "ec2.amazonaws.com",
            },
        }],
    }),
    tags: {
        ...tags,
        Name: "client-timesheet-ec2-role",
    },
});

// ECR Pull Policy for EC2
const ec2EcrPolicy = new aws.iam.RolePolicy("ec2EcrPolicy", {
    name: "ecr-access-policy",
    role: ec2Role.id,
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Sid: "ECRGetAuthToken",
                Effect: "Allow",
                Action: ["ecr:GetAuthorizationToken"],
                Resource: "*",
            },
            {
                Sid: "ECRPullImages",
                Effect: "Allow",
                Action: [
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                ],
                Resource: ecrRepositoryArn,
            },
        ],
    }),
});

// SSM permissions for Session Manager access (no SSH needed)
const ssmManagedInstanceAttachment = new aws.iam.RolePolicyAttachment("ssmManagedInstanceAttachment", {
    role: ec2Role.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
});

const ec2InstanceProfile = new aws.iam.InstanceProfile("ec2InstanceProfile", {
    name: "client-timesheet-ec2-profile",
    role: ec2Role.name,
});

// =============================================================================
// User Data Script
// =============================================================================

const userDataScript = pulumi.interpolate`#!/bin/bash
set -e

# Log all output
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "Starting user data script..."

# Update system
dnf update -y

# Install and start SSM agent (required for SSM Session Manager access)
dnf install -y amazon-ssm-agent
systemctl enable amazon-ssm-agent
systemctl start amazon-ssm-agent

# Install Docker
dnf install -y docker
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -aG docker ec2-user

# Install AWS CLI (already installed on AL2023, but ensure it's available)
dnf install -y aws-cli

# Create app directory
mkdir -p /opt/app
mkdir -p /opt/app/data

# Create deployment script
cat > /opt/app/deploy.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
set -e

AWS_REGION="${awsRegion}"
ECR_REPOSITORY="${ecrRepositoryUrl}"
APP_PORT="${appPort}"

echo "Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY

echo "Pulling latest image..."
docker pull $ECR_REPOSITORY:latest

echo "Stopping existing container..."
docker stop client-timesheet-app 2>/dev/null || true
docker rm client-timesheet-app 2>/dev/null || true

echo "Starting new container..."
docker run -d \
  --name client-timesheet-app \
  --restart unless-stopped \
  -p 80:$APP_PORT \
  -v /opt/app/data:/app/data \
  -e NODE_ENV=production \
  -e PORT=$APP_PORT \
  -e DATABASE_PATH=/app/data/timesheet.db \
  $ECR_REPOSITORY:latest

echo "Cleaning up old images..."
docker image prune -f

echo "Deployment complete!"
DEPLOY_SCRIPT

chmod +x /opt/app/deploy.sh

# Create systemd service for auto-restart
cat > /etc/systemd/system/client-timesheet-app.service << 'SERVICE'
[Unit]
Description=Client Timesheet App
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/opt/app/deploy.sh
ExecStop=/usr/bin/docker stop client-timesheet-app

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable client-timesheet-app

echo "User data script completed successfully!"
`;

// =============================================================================
// EC2 Instance
// =============================================================================

const appInstance = new aws.ec2.Instance("appInstance", {
    ami: amazonLinux2023Ami.then(ami => ami.id),
    instanceType: instanceType,
    vpcSecurityGroupIds: [appSecurityGroup.id],
    subnetId: defaultSubnet.then(subnet => subnet.id),
    iamInstanceProfile: ec2InstanceProfile.name,
    rootBlockDevice: {
        volumeSize: 20,
        volumeType: "gp3",
        encrypted: true,
    },
    userData: userDataScript.apply(script => Buffer.from(script).toString("base64")),
    tags: {
        ...tags,
        Name: "client-timesheet-app",
    },
}, {
    replaceOnChanges: ["userData"],
});

// =============================================================================
// Elastic IP
// =============================================================================

const appEip = new aws.ec2.Eip("appEip", {
    instance: appInstance.id,
    domain: "vpc",
    tags: {
        ...tags,
        Name: "client-timesheet-app-eip",
    },
});

// =============================================================================
// Outputs
// =============================================================================

export const instanceId = appInstance.id;
export const instancePublicIp = appEip.publicIp;
export const instancePublicDns = appEip.publicDns;
export const appUrl = pulumi.interpolate`http://${appEip.publicIp}`;
export const securityGroupId = appSecurityGroup.id;
