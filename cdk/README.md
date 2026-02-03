# Client Timesheet App - AWS CDK Infrastructure

This directory contains the AWS CDK (TypeScript) infrastructure-as-code for deploying the Client Timesheet App to AWS. This is a conversion of the original Terraform configuration.

## Architecture Overview

The simplest and most cost-effective AWS hosting solution for this application:

- **EC2 t3.micro instance** (~$8/month, free tier eligible for 12 months)
- **Docker container** running the full-stack application
- **SQLite database** stored on EBS volume for persistence
- **Elastic IP** for consistent public address
- **ECR** for Docker image storage

The backend serves both the API and the static frontend files, eliminating the need for separate hosting services.

## Prerequisites

Before deploying, you need:

1. **AWS Account** with appropriate permissions
2. **AWS CDK CLI** installed (`npm install -g aws-cdk`)
3. **Node.js** (v18 or later)
4. **AWS CLI** configured with credentials

## CDK Stacks

### Bootstrap Stack (`ClientTimesheetBootstrapStack`)

One-time foundational setup that creates:
- S3 bucket for Terraform state (for backward compatibility)
- DynamoDB table for state locking
- ECR repository for Docker images
- GitHub Actions OIDC provider for secure credential-less deployments
- IAM role with least privilege permissions for GitHub Actions

### Infrastructure Stack (`ClientTimesheetInfrastructureStack`)

Application-specific resources:
- EC2 instance (t3.micro by default)
- Security group (HTTP/HTTPS ingress, no SSH)
- Elastic IP for consistent public address
- IAM role and instance profile for ECR access and SSM

## Deployment Instructions

### Step 1: Install Dependencies

```bash
cd cdk
npm install
```

### Step 2: Bootstrap CDK (First Time Only)

If this is your first time using CDK in this AWS account/region:

```bash
npx cdk bootstrap
```

### Step 3: Deploy Bootstrap Stack

```bash
npx cdk deploy ClientTimesheetBootstrapStack
```

Save the outputs - you'll need them for the infrastructure stack:
- `EcrRepositoryUrl` - ECR repository URL for Docker images
- `EcrRepositoryArn` - ECR repository ARN for IAM policies
- `GitHubActionsRoleArn` - IAM role ARN for GitHub Actions OIDC

### Step 4: Configure GitHub Secrets

In your GitHub repository settings, add the following secrets:

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `AWS_ROLE_ARN` | IAM role ARN for OIDC authentication | From bootstrap output `GitHubActionsRoleArn` |
| `ECR_REPOSITORY_URL` | ECR repository URL | From bootstrap output `EcrRepositoryUrl` |
| `ECR_REPOSITORY_ARN` | ECR repository ARN | From bootstrap output `EcrRepositoryArn` |
| `GH_PAT` | GitHub Personal Access Token | Create PAT with `repo` scope to access the app repo |

### Step 5: Deploy Infrastructure Stack

After deploying the bootstrap stack, deploy the infrastructure with the ECR outputs:

```bash
npx cdk deploy ClientTimesheetInfrastructureStack \
  -c ecrRepositoryUrl="<ECR_REPOSITORY_URL_FROM_BOOTSTRAP>" \
  -c ecrRepositoryArn="<ECR_REPOSITORY_ARN_FROM_BOOTSTRAP>"
```

## Configuration Options

You can customize the deployment using CDK context variables:

| Context Variable | Description | Default |
|-----------------|-------------|---------|
| `awsRegion` | AWS region for deployment | `us-east-1` |
| `githubOrg` | GitHub organization name | `Cognition-Partner-Workshops` |
| `githubRepo` | GitHub repository name | `hosting-client-timesheet-app` |
| `allowDestroy` | Allow destruction of resources | `true` |
| `environment` | Environment name for tagging | `production` |
| `instanceType` | EC2 instance type | `t3.micro` |
| `appPort` | Application port | `3001` |
| `ecrRepositoryUrl` | ECR repository URL (required for infra stack) | - |
| `ecrRepositoryArn` | ECR repository ARN (required for infra stack) | - |

Example with custom configuration:

```bash
npx cdk deploy ClientTimesheetInfrastructureStack \
  -c awsRegion="us-west-2" \
  -c instanceType="t3.small" \
  -c ecrRepositoryUrl="123456789012.dkr.ecr.us-west-2.amazonaws.com/client-timesheet-app" \
  -c ecrRepositoryArn="arn:aws:ecr:us-west-2:123456789012:repository/client-timesheet-app"
```

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch for changes and compile |
| `npm run test` | Run Jest unit tests |
| `npx cdk synth` | Emit synthesized CloudFormation template |
| `npx cdk diff` | Compare deployed stack with current state |
| `npx cdk deploy` | Deploy stack to AWS |
| `npx cdk destroy` | Destroy stack |

## Accessing the Application

After deployment, access the application at:
```
http://<ELASTIC_IP>
```

Get the Elastic IP from CDK outputs after deployment.

## Troubleshooting

### Access EC2 via SSM Session Manager

Use AWS Systems Manager Session Manager to access the EC2 instance (no SSH needed):

```bash
# Get instance ID from CDK outputs or AWS Console
aws ssm start-session --target <INSTANCE_ID>
```

Or use the AWS Console: EC2 > Instances > Select instance > Connect > Session Manager

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

## Security Considerations

- **No SSH access**: Uses SSM Session Manager with IAM-based authentication and audit logging
- **OIDC Authentication**: GitHub Actions uses OIDC - no static AWS credentials stored
- **Least Privilege IAM**: Deployment role has minimal required permissions scoped to specific resources
- The application uses email-only authentication - consider implementing proper auth for production
- SQLite data is stored on EBS - consider regular backups
- HTTPS is not configured - consider adding an Application Load Balancer with ACM certificate

## Cost Estimate

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t3.micro | ~$8.35 (or free with free tier) |
| EBS 20GB gp3 | ~$1.60 |
| Elastic IP | Free (when attached to running instance) |
| ECR | ~$0.10/GB stored |
| Data Transfer | ~$0.09/GB (first 1GB free) |
| **Total** | **~$10-15/month** (or ~$2/month with free tier) |

## Migration from Terraform

If you were previously using the Terraform configuration, note that:

1. The CDK stacks create equivalent resources with the same names where possible
2. You may need to import existing resources or destroy and recreate them
3. The S3 bucket and DynamoDB table for Terraform state are still created for backward compatibility
4. GitHub Actions OIDC configuration remains the same
