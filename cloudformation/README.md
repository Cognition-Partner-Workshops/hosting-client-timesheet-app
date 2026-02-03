# CloudFormation Templates for Client Timesheet App

This directory contains AWS CloudFormation templates equivalent to the Terraform configurations in `../terraform/`.

## Templates

### bootstrap.yaml

Creates foundational resources that are set up once and rarely modified:

- **GitHub Actions OIDC Provider**: Enables GitHub Actions to authenticate with AWS using OIDC tokens
- **IAM Role for GitHub Actions**: Least-privilege role for CI/CD deployments with policies for ECR, EC2, and SSM
- **ECR Repository**: Docker image registry with lifecycle policy to keep last 10 images

### infrastructure.yaml

Creates application-specific resources:

- **Security Group**: Allows HTTP (80) and HTTPS (443) ingress, no SSH (uses SSM Session Manager)
- **IAM Role for EC2**: Grants ECR pull and SSM access
- **EC2 Instance**: Amazon Linux 2023 with Docker, configured via user data script
- **Elastic IP**: Static public IP address for the application

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- Sufficient IAM permissions to create the resources

### Deploy Bootstrap Stack (One-time)

```bash
aws cloudformation create-stack \
  --stack-name client-timesheet-bootstrap \
  --template-body file://bootstrap.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=GitHubOrg,ParameterValue=Cognition-Partner-Workshops \
    ParameterKey=GitHubRepo,ParameterValue=hosting-client-timesheet-app
```

Wait for the stack to complete:

```bash
aws cloudformation wait stack-create-complete --stack-name client-timesheet-bootstrap
```

Get the outputs (needed for infrastructure stack):

```bash
aws cloudformation describe-stacks --stack-name client-timesheet-bootstrap \
  --query 'Stacks[0].Outputs'
```

### Deploy Infrastructure Stack

```bash
# Get ECR values from bootstrap stack outputs
ECR_URL=$(aws cloudformation describe-stacks --stack-name client-timesheet-bootstrap \
  --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryUrl`].OutputValue' --output text)
ECR_ARN=$(aws cloudformation describe-stacks --stack-name client-timesheet-bootstrap \
  --query 'Stacks[0].Outputs[?OutputKey==`ECRRepositoryArn`].OutputValue' --output text)

# Get default VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' --output text)

aws cloudformation create-stack \
  --stack-name client-timesheet-infrastructure \
  --template-body file://infrastructure.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=VpcId,ParameterValue=$VPC_ID \
    ParameterKey=ECRRepositoryUrl,ParameterValue=$ECR_URL \
    ParameterKey=ECRRepositoryArn,ParameterValue=$ECR_ARN
```

Wait for completion:

```bash
aws cloudformation wait stack-create-complete --stack-name client-timesheet-infrastructure
```

Get the application URL:

```bash
aws cloudformation describe-stacks --stack-name client-timesheet-infrastructure \
  --query 'Stacks[0].Outputs[?OutputKey==`AppUrl`].OutputValue' --output text
```

## Updating Stacks

```bash
aws cloudformation update-stack \
  --stack-name client-timesheet-infrastructure \
  --template-body file://infrastructure.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameters \
    ParameterKey=VpcId,UsePreviousValue=true \
    ParameterKey=ECRRepositoryUrl,UsePreviousValue=true \
    ParameterKey=ECRRepositoryArn,UsePreviousValue=true
```

## Deleting Stacks

Delete in reverse order (infrastructure first, then bootstrap):

```bash
# Delete infrastructure
aws cloudformation delete-stack --stack-name client-timesheet-infrastructure
aws cloudformation wait stack-delete-complete --stack-name client-timesheet-infrastructure

# Delete bootstrap (this will delete ECR repository and all images)
aws cloudformation delete-stack --stack-name client-timesheet-bootstrap
aws cloudformation wait stack-delete-complete --stack-name client-timesheet-bootstrap
```

## Comparison with Terraform

| Feature | Terraform | CloudFormation |
|---------|-----------|----------------|
| State Management | S3 + DynamoDB | AWS-managed |
| Language | HCL | YAML/JSON |
| Provider Support | Multi-cloud | AWS only |
| Drift Detection | `terraform plan` | Stack drift detection |
| Rollback | Manual | Automatic on failure |

The CloudFormation templates provide equivalent functionality to the Terraform configurations but with AWS-native state management and automatic rollback capabilities.
