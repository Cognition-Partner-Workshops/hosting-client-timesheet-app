import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as fs from "fs";
import * as path from "path";

// Configuration
const config = new pulumi.Config();
const awsRegion = config.get("awsRegion") || "us-east-1";
const environment = config.get("environment") || "production";
const instanceType = config.get("instanceType") || "t3.micro";
const ecrRepositoryUrl = config.require("ecrRepositoryUrl");
const ecrRepositoryArn = config.require("ecrRepositoryArn");
const appPort = config.getNumber("appPort") || 3001;

// Common tags
const tags = {
    Environment: environment,
    Project: "client-timesheet-app",
    ManagedBy: "pulumi-infrastructure",
};

// Get availability zones
const availabilityZones = aws.getAvailabilityZones({
    state: "available",
});

// Get the latest Amazon Linux 2023 AMI
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

// Use the default VPC
const defaultVpc = new aws.ec2.DefaultVpc("default-vpc", {
    tags: {
        Name: "Default VPC",
    },
});

// Use the default subnet in the first availability zone
const defaultSubnet = new aws.ec2.DefaultSubnet("default-subnet", {
    availabilityZone: availabilityZones.then(azs => azs.names[0]),
    tags: {
        Name: "Default Subnet",
    },
});

// =============================================================================
// Security Group
// =============================================================================

const appSecurityGroup = new aws.ec2.SecurityGroup("app-security-group", {
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
        // No SSH ingress needed - using SSM Session Manager instead
        // This is more secure as it:
        // - Doesn't require open ports
        // - Uses IAM for authentication
        // - Provides audit logging
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

const ec2Role = new aws.iam.Role("ec2-role", {
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
const ecrPolicy = new aws.iam.RolePolicy("ecr-access-policy", {
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
const ssmManagedInstanceAttachment = new aws.iam.RolePolicyAttachment("ssm-managed-instance", {
    role: ec2Role.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
});

// IAM Instance Profile
const ec2InstanceProfile = new aws.iam.InstanceProfile("ec2-instance-profile", {
    name: "client-timesheet-ec2-profile",
    role: ec2Role.name,
});

// =============================================================================
// EC2 Instance
// =============================================================================

// Read and template the user data script
const userDataTemplate = fs.readFileSync(path.join(__dirname, "user_data.sh"), "utf-8");
const userData = userDataTemplate
    .replace(/\$\{AWS_REGION\}/g, awsRegion)
    .replace(/\$\{ECR_REPOSITORY\}/g, ecrRepositoryUrl)
    .replace(/\$\{APP_PORT\}/g, appPort.toString());

const appInstance = new aws.ec2.Instance("app-instance", {
    ami: amazonLinux2023Ami.then(ami => ami.id),
    instanceType: instanceType,
    vpcSecurityGroupIds: [appSecurityGroup.id],
    subnetId: defaultSubnet.id,
    iamInstanceProfile: ec2InstanceProfile.name,
    rootBlockDevice: {
        volumeSize: 20,
        volumeType: "gp3",
        encrypted: true,
    },
    userData: Buffer.from(userData).toString("base64"),
    tags: {
        ...tags,
        Name: "client-timesheet-app",
    },
}, {
    // Lifecycle: create before destroy for minimal downtime
    replaceOnChanges: ["userData"],
});

// =============================================================================
// Elastic IP
// =============================================================================

const appEip = new aws.ec2.Eip("app-eip", {
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
