# Pulumi Infrastructure for Client Timesheet App

This directory contains the Pulumi TypeScript implementation of the infrastructure-as-code for the Client Timesheet App, converted from the original Terraform configuration.

## Conversion Documentation

### Overview

The Terraform infrastructure has been converted to Pulumi using TypeScript. The conversion maintains the same two-module architecture:

1. **Bootstrap** (`pulumi/bootstrap/`) - One-time foundational setup
2. **Infrastructure** (`pulumi/infrastructure/`) - Application-specific resources

### Conversion Approach

The conversion followed these principles:

1. **1:1 Resource Mapping**: Each Terraform resource was mapped to its equivalent Pulumi AWS resource
2. **Configuration Preservation**: All configuration options, tags, and policies were preserved
3. **TypeScript for Type Safety**: Using TypeScript provides compile-time type checking and better IDE support
4. **Pulumi Best Practices**: Leveraged Pulumi's native features like `pulumi.interpolate` for string interpolation

### Resource Mapping

#### Bootstrap Module

| Terraform Resource | Pulumi Resource | Notes |
|-------------------|-----------------|-------|
| `aws_s3_bucket.terraform_state` | `aws.s3.Bucket` | S3 bucket for Terraform state |
| `aws_s3_bucket_versioning.terraform_state` | `aws.s3.BucketVersioningV2` | Versioning configuration |
| `aws_s3_bucket_server_side_encryption_configuration.terraform_state` | `aws.s3.BucketServerSideEncryptionConfigurationV2` | Encryption settings |
| `aws_s3_bucket_public_access_block.terraform_state` | `aws.s3.BucketPublicAccessBlock` | Public access block |
| `aws_dynamodb_table.terraform_locks` | `aws.dynamodb.Table` | DynamoDB for state locking |
| `aws_ecr_repository.app` | `aws.ecr.Repository` | ECR repository |
| `aws_ecr_lifecycle_policy.app` | `aws.ecr.LifecyclePolicy` | Image retention policy |
| `aws_iam_openid_connect_provider.github_actions` | `aws.iam.OpenIdConnectProvider` | GitHub OIDC provider |
| `aws_iam_role.github_actions_deploy` | `aws.iam.Role` | GitHub Actions IAM role |
| `aws_iam_role_policy.github_actions_ecr` | `aws.iam.RolePolicy` | ECR permissions |
| `aws_iam_role_policy.github_actions_ec2` | `aws.iam.RolePolicy` | EC2 describe permissions |
| `aws_iam_role_policy.github_actions_ssm` | `aws.iam.RolePolicy` | SSM permissions |

#### Infrastructure Module

| Terraform Resource | Pulumi Resource | Notes |
|-------------------|-----------------|-------|
| `aws_default_vpc.default` | `aws.ec2.DefaultVpc` | Default VPC |
| `aws_default_subnet.default` | `aws.ec2.DefaultSubnet` | Default subnet |
| `aws_security_group.app` | `aws.ec2.SecurityGroup` | Security group with HTTP/HTTPS |
| `aws_iam_role.ec2_role` | `aws.iam.Role` | EC2 IAM role |
| `aws_iam_role_policy.ecr_policy` | `aws.iam.RolePolicy` | ECR pull permissions |
| `aws_iam_role_policy_attachment.ssm_managed_instance` | `aws.iam.RolePolicyAttachment` | SSM managed policy |
| `aws_iam_instance_profile.ec2_profile` | `aws.iam.InstanceProfile` | Instance profile |
| `aws_instance.app` | `aws.ec2.Instance` | EC2 instance |
| `aws_eip.app` | `aws.ec2.Eip` | Elastic IP |

### Key Differences from Terraform

1. **Language**: TypeScript instead of HCL provides better IDE support and type checking
2. **State Management**: Pulumi uses its own state backend (Pulumi Cloud by default, or self-managed S3/Azure Blob/GCS)
3. **Configuration**: Uses `pulumi.Config()` instead of Terraform variables
4. **Interpolation**: Uses `pulumi.interpolate` template literals instead of `${var.name}`
5. **Outputs**: Uses TypeScript `export` statements instead of `output` blocks

### Configuration Variables

#### Bootstrap Stack

| Variable | Default | Description |
|----------|---------|-------------|
| `awsRegion` | `us-east-1` | AWS region for resources |
| `allowDestroy` | `true` | Allow destruction of bootstrap resources |
| `githubOrg` | `Cognition-Partner-Workshops` | GitHub organization name |
| `githubRepo` | `hosting-client-timesheet-app` | GitHub repository name |

#### Infrastructure Stack

| Variable | Default | Description |
|----------|---------|-------------|
| `awsRegion` | `us-east-1` | AWS region for resources |
| `environment` | `production` | Environment name |
| `instanceType` | `t3.micro` | EC2 instance type |
| `ecrRepositoryUrl` | (required) | ECR repository URL |
| `ecrRepositoryArn` | (required) | ECR repository ARN |
| `appPort` | `3001` | Application port |

## Prerequisites

1. **Node.js** (v18 or later)
2. **Pulumi CLI** - Install with `curl -fsSL https://get.pulumi.com | sh`
3. **AWS CLI** configured with appropriate credentials
4. **AWS Account** with appropriate permissions

## Usage

### Step 1: Deploy Bootstrap Stack

```bash
cd pulumi/bootstrap

# Install dependencies
npm install

# Login to Pulumi (use local backend for testing)
pulumi login --local
# Or use Pulumi Cloud: pulumi login

# Create a new stack
pulumi stack init production

# Preview changes
pulumi preview

# Deploy
pulumi up
```

Save the outputs for the infrastructure stack:
- `ecrRepositoryUrl`
- `ecrRepositoryArn`
- `githubActionsRoleArn`

### Step 2: Deploy Infrastructure Stack

```bash
cd pulumi/infrastructure

# Install dependencies
npm install

# Create a new stack
pulumi stack init production

# Set required configuration
pulumi config set ecrRepositoryUrl <ECR_REPOSITORY_URL_FROM_BOOTSTRAP>
pulumi config set ecrRepositoryArn <ECR_REPOSITORY_ARN_FROM_BOOTSTRAP>

# Preview changes
pulumi preview

# Deploy
pulumi up
```

### Step 3: Configure GitHub Secrets

Add the following secrets to your GitHub repository:

| Secret Name | Description |
|-------------|-------------|
| `AWS_ROLE_ARN` | From bootstrap output `githubActionsRoleArn` |
| `ECR_REPOSITORY_URL` | From bootstrap output `ecrRepositoryUrl` |
| `ECR_REPOSITORY_ARN` | From bootstrap output `ecrRepositoryArn` |

## Outputs

### Bootstrap Stack Outputs

- `terraformStateBucketName` - S3 bucket for Terraform state (for migration)
- `terraformLockTableName` - DynamoDB table for state locking
- `ecrRepositoryUrl` - ECR repository URL
- `ecrRepositoryName` - ECR repository name
- `ecrRepositoryArn` - ECR repository ARN
- `awsAccountId` - AWS Account ID
- `githubActionsRoleArn` - IAM role ARN for GitHub Actions
- `githubActionsOidcProviderArn` - OIDC provider ARN

### Infrastructure Stack Outputs

- `instanceId` - EC2 instance ID
- `instancePublicIp` - Elastic IP address
- `instancePublicDns` - Public DNS name
- `appUrl` - Application URL
- `securityGroupId` - Security group ID

## Migration from Terraform

If you have existing Terraform-managed infrastructure, you can:

1. **Import existing resources** using `pulumi import`
2. **Run both in parallel** during transition
3. **Gradually migrate** by importing resources one at a time

Example import command:
```bash
pulumi import aws:ec2/instance:Instance app-instance i-1234567890abcdef0
```

## Destroying Resources

```bash
# Destroy infrastructure first
cd pulumi/infrastructure
pulumi destroy

# Then destroy bootstrap
cd ../bootstrap
pulumi destroy
```

## Troubleshooting

### Access EC2 via SSM Session Manager

```bash
# Get instance ID from Pulumi outputs
INSTANCE_ID=$(pulumi stack output instanceId)

# Start SSM session
aws ssm start-session --target $INSTANCE_ID
```

### View Logs

```bash
# Via SSM session:
sudo cat /var/log/user-data.log
docker logs client-timesheet-app
```

### Manual Deployment

```bash
# Via SSM session:
sudo /opt/app/deploy.sh
```
