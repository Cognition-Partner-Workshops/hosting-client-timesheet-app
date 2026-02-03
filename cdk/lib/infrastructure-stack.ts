import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface InfrastructureStackProps extends cdk.StackProps {
  environment?: string;
  instanceType?: string;
  ecrRepositoryUrl: string;
  ecrRepositoryArn: string;
  appPort?: number;
}

export class InfrastructureStack extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly elasticIp: ec2.CfnEIP;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);

    const environment = props.environment ?? 'production';
    const instanceType = props.instanceType ?? 't3.micro';
    const appPort = props.appPort ?? 3001;
    const ecrRepositoryUrl = props.ecrRepositoryUrl;
    const ecrRepositoryArn = props.ecrRepositoryArn;

    const projectTags = {
      Environment: environment,
      Project: 'client-timesheet-app',
    };

    // =============================================================================
    // VPC - Use Default VPC
    // =============================================================================

    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', {
      isDefault: true,
    });

    // =============================================================================
    // Security Group
    // =============================================================================

    this.securityGroup = new ec2.SecurityGroup(this, 'AppSecurityGroup', {
      vpc,
      securityGroupName: 'client-timesheet-app-sg',
      description: 'Security group for Client Timesheet App',
      allowAllOutbound: true,
    });

    // HTTP access for the application
    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP'
    );

    // HTTPS access for the application
    this.securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'HTTPS'
    );

    // No SSH ingress needed - using SSM Session Manager instead
    // This is more secure as it:
    // - Doesn't require open ports
    // - Uses IAM for authentication
    // - Provides audit logging

    cdk.Tags.of(this.securityGroup).add('Name', 'client-timesheet-app-sg');
    Object.entries(projectTags).forEach(([key, value]) => {
      cdk.Tags.of(this.securityGroup).add(key, value);
    });

    // =============================================================================
    // IAM Role for EC2
    // =============================================================================

    const ec2Role = new iam.Role(this, 'Ec2Role', {
      roleName: 'client-timesheet-ec2-role',
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    cdk.Tags.of(ec2Role).add('Name', 'client-timesheet-ec2-role');
    Object.entries(projectTags).forEach(([key, value]) => {
      cdk.Tags.of(ec2Role).add(key, value);
    });

    // ECR Pull Policy (scoped to specific repository)
    ec2Role.addToPolicy(new iam.PolicyStatement({
      sid: 'ECRGetAuthToken',
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    ec2Role.addToPolicy(new iam.PolicyStatement({
      sid: 'ECRPullImages',
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
      ],
      resources: [ecrRepositoryArn],
    }));

    // SSM permissions for Session Manager access (no SSH needed)
    ec2Role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')
    );

    // =============================================================================
    // User Data Script
    // =============================================================================

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'set -e',
      '',
      '# Log all output',
      'exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1',
      '',
      'echo "Starting user data script..."',
      '',
      '# Update system',
      'dnf update -y',
      '',
      '# Install and start SSM agent (required for SSM Session Manager access)',
      'dnf install -y amazon-ssm-agent',
      'systemctl enable amazon-ssm-agent',
      'systemctl start amazon-ssm-agent',
      '',
      '# Install Docker',
      'dnf install -y docker',
      'systemctl start docker',
      'systemctl enable docker',
      '',
      '# Add ec2-user to docker group',
      'usermod -aG docker ec2-user',
      '',
      '# Install AWS CLI (already installed on AL2023, but ensure it\'s available)',
      'dnf install -y aws-cli',
      '',
      '# Create app directory',
      'mkdir -p /opt/app',
      'mkdir -p /opt/app/data',
      '',
      '# Create deployment script',
      `cat > /opt/app/deploy.sh << 'DEPLOY_SCRIPT'`,
      '#!/bin/bash',
      'set -e',
      '',
      `AWS_REGION="${this.region}"`,
      `ECR_REPOSITORY="${ecrRepositoryUrl}"`,
      `APP_PORT="${appPort}"`,
      '',
      'echo "Logging into ECR..."',
      'aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY',
      '',
      'echo "Pulling latest image..."',
      'docker pull $ECR_REPOSITORY:latest',
      '',
      'echo "Stopping existing container..."',
      'docker stop client-timesheet-app 2>/dev/null || true',
      'docker rm client-timesheet-app 2>/dev/null || true',
      '',
      'echo "Starting new container..."',
      'docker run -d \\',
      '  --name client-timesheet-app \\',
      '  --restart unless-stopped \\',
      '  -p 80:$APP_PORT \\',
      '  -v /opt/app/data:/app/data \\',
      '  -e NODE_ENV=production \\',
      '  -e PORT=$APP_PORT \\',
      '  -e DATABASE_PATH=/app/data/timesheet.db \\',
      '  $ECR_REPOSITORY:latest',
      '',
      'echo "Cleaning up old images..."',
      'docker image prune -f',
      '',
      'echo "Deployment complete!"',
      'DEPLOY_SCRIPT',
      '',
      'chmod +x /opt/app/deploy.sh',
      '',
      '# Create systemd service for auto-restart',
      `cat > /etc/systemd/system/client-timesheet-app.service << 'SERVICE'`,
      '[Unit]',
      'Description=Client Timesheet App',
      'After=docker.service',
      'Requires=docker.service',
      '',
      '[Service]',
      'Type=oneshot',
      'RemainAfterExit=yes',
      'ExecStart=/opt/app/deploy.sh',
      'ExecStop=/usr/bin/docker stop client-timesheet-app',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'SERVICE',
      '',
      'systemctl daemon-reload',
      'systemctl enable client-timesheet-app',
      '',
      'echo "User data script completed successfully!"'
    );

    // =============================================================================
    // EC2 Instance
    // =============================================================================

    // Look up Amazon Linux 2023 AMI
    const machineImage = ec2.MachineImage.latestAmazonLinux2023({
      cpuType: ec2.AmazonLinuxCpuType.X86_64,
    });

    this.instance = new ec2.Instance(this, 'AppInstance', {
      vpc,
      instanceType: new ec2.InstanceType(instanceType),
      machineImage,
      securityGroup: this.securityGroup,
      role: ec2Role,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    cdk.Tags.of(this.instance).add('Name', 'client-timesheet-app');
    Object.entries(projectTags).forEach(([key, value]) => {
      cdk.Tags.of(this.instance).add(key, value);
    });

    // =============================================================================
    // Elastic IP
    // =============================================================================

    this.elasticIp = new ec2.CfnEIP(this, 'AppElasticIp', {
      domain: 'vpc',
      instanceId: this.instance.instanceId,
      tags: [
        { key: 'Name', value: 'client-timesheet-app-eip' },
        { key: 'Environment', value: environment },
        { key: 'Project', value: 'client-timesheet-app' },
      ],
    });

    // =============================================================================
    // Outputs
    // =============================================================================

    new cdk.CfnOutput(this, 'InstanceId', {
      description: 'EC2 instance ID',
      value: this.instance.instanceId,
      exportName: 'InstanceId',
    });

    new cdk.CfnOutput(this, 'InstancePublicIp', {
      description: 'EC2 instance public IP (Elastic IP)',
      value: this.elasticIp.attrPublicIp,
      exportName: 'InstancePublicIp',
    });

    new cdk.CfnOutput(this, 'AppUrl', {
      description: 'Application URL',
      value: `http://${this.elasticIp.attrPublicIp}`,
      exportName: 'AppUrl',
    });

    new cdk.CfnOutput(this, 'SecurityGroupId', {
      description: 'Security group ID',
      value: this.securityGroup.securityGroupId,
      exportName: 'SecurityGroupId',
    });
  }
}
