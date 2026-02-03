# Client Timesheet App - Pulumi Infrastructure

This directory contains the Pulumi infrastructure-as-code for deploying the Client Timesheet App to AWS. This is a TypeScript-based Pulumi conversion of the original Terraform configuration.

## Architecture Overview

The infrastructure consists of two separate Pulumi projects:

1. **Bootstrap** (`pulumi/bootstrap/`) - One-time setup resources:
   - S3 bucket for Terraform state (for migration compatibility)
   - DynamoDB table for state locking
   - ECR repository for Docker images
   - GitHub Actions OIDC provider for secure credential-less deployments
   - IAM role with least privilege permissions for GitHub Actions

2. **Infrastructure** (`pulumi/infrastructure/`) - Main application resources:
   - EC2 t3.micro instance (~$8/month, free tier eligible)
   - Security Group (HTTP/HTTPS access, no SSH - uses SSM)
   - Elastic IP for consistent public address
   - IAM role for EC2 with ECR pull and SSM permissions

## Prerequisites

### Install Pulumi

```bash
# macOS
brew install pulumi

# Linux
curl -fsSL https://get.pulumi.com | sh

# Windows
choco install pulumi
```

### Install Node.js

Pulumi TypeScript requires Node.js 18 or higher.

```bash
# Using nvm (recommended)
nvm install 20
nvm use 20
```

### Configure AWS Credentials

```bash
# Option 1: AWS CLI configuration
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=<your-access-key>
export AWS_SECRET_ACCESS_KEY=<your-secret-key>
export AWS_REGION=us-east-1
```

### Configure Pulumi Backend

```bash
# Option 1: Pulumi Cloud (recommended for teams)
pulumi login

# Option 2: Local backend
pulumi login --local

# Option 3: S3 backend
pulumi login s3://your-state-bucket
```

## Directory Structure

```
pulumi/
├── bootstrap/                    # Bootstrap infrastructure
│   ├── Pulumi.yaml              # Project configuration
│   ├── package.json             # Node.js dependencies
│   ├── tsconfig.json            # TypeScript configuration
│   └── index.ts                 # Infrastructure code
├── infrastructure/              # Main infrastructure
│   ├── Pulumi.yaml              # Project configuration
│   ├── package.json             # Node.js dependencies
│   ├── tsconfig.json            # TypeScript configuration
│   └── index.ts                 # Infrastructure code
└── README.md                    # This file
```

## Deployment Instructions

### Step 1: Deploy Bootstrap Infrastructure

```bash
cd pulumi/bootstrap

# Install dependencies
npm install

# Create a new stack (e.g., "production")
pulumi stack init production

# Configure AWS region
pulumi config set aws:region us-east-1

# Optional: Configure GitHub org/repo for OIDC
pulumi config set githubOrg Cognition-Partner-Workshops
pulumi config set githubRepo hosting-client-timesheet-app

# Preview changes
pulumi preview

# Deploy
pulumi up
```

Save the outputs - you'll need them for the infrastructure deployment:
- `ecrRepositoryUrl` - ECR repository URL
- `ecrRepositoryArn` - ECR repository ARN
- `githubActionsRoleArn` - IAM role ARN for GitHub Actions

### Step 2: Configure GitHub Secrets

In your GitHub repository settings, add the following secrets:

| Secret Name | Description | Source |
|-------------|-------------|--------|
| `AWS_ROLE_ARN` | IAM role ARN for OIDC authentication | `githubActionsRoleArn` output |
| `ECR_REPOSITORY_URL` | ECR repository URL | `ecrRepositoryUrl` output |
| `ECR_REPOSITORY_ARN` | ECR repository ARN | `ecrRepositoryArn` output |

### Step 3: Deploy Main Infrastructure

```bash
cd pulumi/infrastructure

# Install dependencies
npm install

# Create a new stack (e.g., "production")
pulumi stack init production

# Configure AWS region
pulumi config set aws:region us-east-1

# Set required configuration from bootstrap outputs
pulumi config set ecrRepositoryUrl <ECR_REPOSITORY_URL>
pulumi config set ecrRepositoryArn <ECR_REPOSITORY_ARN>

# Optional: Configure instance type and app port
pulumi config set instanceType t3.micro
pulumi config set appPort 3001

# Preview changes
pulumi preview

# Deploy
pulumi up
```

### Step 4: Access the Application

After deployment, get the application URL:

```bash
cd pulumi/infrastructure
pulumi stack output appUrl
```

## Configuration Options

### Bootstrap Configuration

| Config Key | Description | Default |
|------------|-------------|---------|
| `aws:region` | AWS region | `us-east-1` |
| `allowDestroy` | Allow destruction of resources | `true` |
| `githubOrg` | GitHub organization name | `Cognition-Partner-Workshops` |
| `githubRepo` | GitHub repository name | `hosting-client-timesheet-app` |

### Infrastructure Configuration

| Config Key | Description | Default |
|------------|-------------|---------|
| `aws:region` | AWS region | `us-east-1` |
| `environment` | Environment name | `production` |
| `instanceType` | EC2 instance type | `t3.micro` |
| `ecrRepositoryUrl` | ECR repository URL | **Required** |
| `ecrRepositoryArn` | ECR repository ARN | **Required** |
| `appPort` | Application port | `3001` |

## Common Commands

```bash
# Preview changes
pulumi preview

# Deploy changes
pulumi up

# View outputs
pulumi stack output

# View specific output
pulumi stack output instancePublicIp

# Destroy infrastructure
pulumi destroy

# View stack configuration
pulumi config

# Switch stacks
pulumi stack select <stack-name>

# List all stacks
pulumi stack ls
```

## Accessing EC2 via SSM Session Manager

No SSH is needed - use AWS Systems Manager Session Manager:

```bash
# Get instance ID from Pulumi
INSTANCE_ID=$(pulumi stack output instanceId)

# Start SSM session
aws ssm start-session --target $INSTANCE_ID
```

Or use the AWS Console: EC2 > Instances > Select instance > Connect > Session Manager

## Troubleshooting

### Check EC2 Logs

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

### Check Container Status

```bash
# Via SSM session:
docker ps
docker logs client-timesheet-app
```

## Migration from Terraform

If you're migrating from the existing Terraform setup:

1. **Export Terraform state** (optional, for reference):
   ```bash
   cd terraform/infrastructure
   terraform state list
   terraform show
   ```

2. **Import existing resources** (if needed):
   Pulumi can import existing AWS resources. See [Pulumi Import](https://www.pulumi.com/docs/guides/adopting/import/).

3. **Destroy Terraform resources** (after Pulumi is working):
   ```bash
   cd terraform/infrastructure
   terraform destroy
   ```

**Note:** The bootstrap Pulumi project creates the same S3 bucket and DynamoDB table as Terraform for compatibility. If these already exist, you may need to import them or adjust the resource names.

## Cost Estimate

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t3.micro | ~$8.35 (or free with free tier) |
| EBS 20GB gp3 | ~$1.60 |
| Elastic IP | Free (when attached to running instance) |
| ECR | ~$0.10/GB stored |
| Data Transfer | ~$0.09/GB (first 1GB free) |
| **Total** | **~$10-15/month** (or ~$2/month with free tier) |

## Security Considerations

- **No SSH access**: Uses SSM Session Manager with IAM-based authentication and audit logging
- **OIDC Authentication**: GitHub Actions uses OIDC - no static AWS credentials stored
- **Least Privilege IAM**: Deployment role has minimal required permissions scoped to specific resources
- **Encrypted EBS**: Root volume is encrypted by default
