import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BootstrapStackProps extends cdk.StackProps {
  githubOrg?: string;
  githubRepo?: string;
  allowDestroy?: boolean;
}

export class BootstrapStack extends cdk.Stack {
  public readonly terraformStateBucket: s3.Bucket;
  public readonly terraformLockTable: dynamodb.Table;
  public readonly ecrRepository: ecr.Repository;
  public readonly githubActionsRole: iam.Role;
  public readonly githubOidcProvider: iam.OpenIdConnectProvider;

  constructor(scope: Construct, id: string, props?: BootstrapStackProps) {
    super(scope, id, props);

    const githubOrg = props?.githubOrg ?? 'Cognition-Partner-Workshops';
    const githubRepo = props?.githubRepo ?? 'hosting-client-timesheet-app';
    const allowDestroy = props?.allowDestroy ?? true;

    const tags = {
      Environment: 'shared',
      Project: 'client-timesheet-app',
      ManagedBy: 'cdk-bootstrap',
    };

    // =============================================================================
    // Terraform State Backend Resources
    // =============================================================================

    this.terraformStateBucket = new s3.Bucket(this, 'TerraformStateBucket', {
      bucketName: `client-timesheet-terraform-state-${this.account}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: allowDestroy ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: allowDestroy,
    });

    cdk.Tags.of(this.terraformStateBucket).add('Name', 'Terraform State Bucket');
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.terraformStateBucket).add(key, value);
    });

    this.terraformLockTable = new dynamodb.Table(this, 'TerraformLockTable', {
      tableName: 'client-timesheet-terraform-locks',
      partitionKey: { name: 'LockID', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: allowDestroy ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });

    cdk.Tags.of(this.terraformLockTable).add('Name', 'Terraform Lock Table');
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.terraformLockTable).add(key, value);
    });

    // =============================================================================
    // ECR Repository
    // =============================================================================

    this.ecrRepository = new ecr.Repository(this, 'AppEcrRepository', {
      repositoryName: 'client-timesheet-app',
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      removalPolicy: allowDestroy ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      emptyOnDelete: allowDestroy,
      lifecycleRules: [
        {
          description: 'Keep last 10 images',
          maxImageCount: 10,
        },
      ],
    });

    cdk.Tags.of(this.ecrRepository).add('Name', 'Client Timesheet App ECR');
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.ecrRepository).add(key, value);
    });

    // =============================================================================
    // GitHub Actions OIDC Provider and Deployment Role (Least Privilege)
    // =============================================================================

    this.githubOidcProvider = new iam.OpenIdConnectProvider(this, 'GitHubActionsOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
      thumbprints: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
    });

    cdk.Tags.of(this.githubOidcProvider).add('Name', 'GitHub Actions OIDC Provider');
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.githubOidcProvider).add(key, value);
    });

    this.githubActionsRole = new iam.Role(this, 'GitHubActionsDeployRole', {
      roleName: 'client-timesheet-github-actions-deploy',
      assumedBy: new iam.FederatedPrincipal(
        this.githubOidcProvider.openIdConnectProviderArn,
        {
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
          StringLike: {
            'token.actions.githubusercontent.com:sub': `repo:${githubOrg}/${githubRepo}:*`,
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    cdk.Tags.of(this.githubActionsRole).add('Name', 'GitHub Actions Deploy Role');
    Object.entries(tags).forEach(([key, value]) => {
      cdk.Tags.of(this.githubActionsRole).add(key, value);
    });

    // ECR Push/Pull Policy (scoped to specific repository)
    this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ECRGetAuthToken',
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'ECRPushPull',
      effect: iam.Effect.ALLOW,
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:PutImage',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
      ],
      resources: [this.ecrRepository.repositoryArn],
    }));

    // EC2 Describe Policy (for getting instance ID by tag)
    this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'EC2DescribeAll',
      effect: iam.Effect.ALLOW,
      actions: ['ec2:DescribeInstances'],
      resources: ['*'],
    }));

    // SSM Send Command Policy (for deployment via Systems Manager)
    this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SSMSendCommand',
      effect: iam.Effect.ALLOW,
      actions: ['ssm:SendCommand'],
      resources: [
        `arn:aws:ssm:${this.region}::document/AWS-RunShellScript`,
        `arn:aws:ec2:${this.region}:${this.account}:instance/*`,
      ],
      conditions: {
        StringEquals: {
          'ssm:resourceTag/Project': 'client-timesheet-app',
        },
      },
    }));

    this.githubActionsRole.addToPolicy(new iam.PolicyStatement({
      sid: 'SSMGetCommandInvocation',
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetCommandInvocation'],
      resources: ['*'],
    }));

    // =============================================================================
    // Outputs
    // =============================================================================

    new cdk.CfnOutput(this, 'TerraformStateBucketName', {
      description: 'S3 bucket for Terraform state',
      value: this.terraformStateBucket.bucketName,
      exportName: 'TerraformStateBucket',
    });

    new cdk.CfnOutput(this, 'TerraformLockTableName', {
      description: 'DynamoDB table for Terraform state locking',
      value: this.terraformLockTable.tableName,
      exportName: 'TerraformLockTable',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUrl', {
      description: 'ECR repository URL for the application',
      value: this.ecrRepository.repositoryUri,
      exportName: 'EcrRepositoryUrl',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryName', {
      description: 'ECR repository name',
      value: this.ecrRepository.repositoryName,
      exportName: 'EcrRepositoryName',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryArn', {
      description: 'ECR repository ARN',
      value: this.ecrRepository.repositoryArn,
      exportName: 'EcrRepositoryArn',
    });

    new cdk.CfnOutput(this, 'AwsAccountId', {
      description: 'AWS Account ID',
      value: this.account,
      exportName: 'AwsAccountId',
    });

    new cdk.CfnOutput(this, 'GitHubActionsRoleArn', {
      description: 'IAM Role ARN for GitHub Actions to assume via OIDC',
      value: this.githubActionsRole.roleArn,
      exportName: 'GitHubActionsRoleArn',
    });

    new cdk.CfnOutput(this, 'GitHubActionsOidcProviderArn', {
      description: 'GitHub Actions OIDC Provider ARN',
      value: this.githubOidcProvider.openIdConnectProviderArn,
      exportName: 'GitHubActionsOidcProviderArn',
    });
  }
}
