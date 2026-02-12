# Local Deployment Instructions - Client Timesheet Application

This guide walks you through deploying the Client Timesheet Application to AWS from your local machine. The application supports two deployment modes:

| Mode | Description | Access | Cost |
|------|-------------|--------|------|
| **EC2 Container** | Docker container on a single EC2 instance | `http://<ELASTIC_IP>` (port 80) | ~$10-15/month (~$2 with Free Tier) |
| **Serverless** | Frontend on S3 + Backend on API Gateway/Lambda | Two separate URLs | Pay-per-use, scales to zero |

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [AWS Account Setup](#2-aws-account-setup)
3. [Repository Setup](#3-repository-setup)
4. [Bootstrap AWS Infrastructure (Required for Both Modes)](#4-bootstrap-aws-infrastructure-required-for-both-modes)
5. [Choose Your Deployment Mode](#5-choose-your-deployment-mode)
6. [Option A: EC2 Container Deployment](#6-option-a-ec2-container-deployment)
7. [Option B: Serverless Deployment](#7-option-b-serverless-deployment)
8. [Accessing the Application](#8-accessing-the-application)
9. [Teardown / Cleanup](#9-teardown--cleanup)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

Install the following tools on your local machine before proceeding:

| Tool | Version | Installation |
|------|---------|-------------|
| **AWS CLI** | v2+ | [Install AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| **Terraform** | >= 1.0 | [Install Terraform](https://developer.hashicorp.com/terraform/install) |
| **Docker** | Latest (only for local testing) | [Install Docker](https://docs.docker.com/get-docker/) |
| **Node.js** | v20+ (only for serverless local testing) | [Install Node.js](https://nodejs.org/) |
| **Git** | Latest | [Install Git](https://git-scm.com/downloads) |
| **Session Manager Plugin** | Latest (for EC2 troubleshooting) | [Install SSM Plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) |

Verify your installations:

```bash
aws --version
terraform --version
docker --version
node --version
git --version
```

---

## 2. AWS Account Setup

You need an AWS account with permissions to create EC2 instances, S3 buckets, DynamoDB tables, Lambda functions, API Gateway, ECR repositories, IAM roles, and Elastic IPs.

### Configure AWS Credentials

```bash
aws configure
```

You will be prompted for:

```
AWS Access Key ID [None]: <YOUR_ACCESS_KEY_ID>
AWS Secret Access Key [None]: <YOUR_SECRET_ACCESS_KEY>
Default region name [None]: us-east-1
Default output format [None]: json
```

Verify your credentials are working:

```bash
aws sts get-caller-identity
```

You should see output containing your `Account`, `UserId`, and `Arn`.

---

## 3. Repository Setup

Clone the hosting infrastructure repository:

```bash
git clone https://github.com/Cognition-Partner-Workshops/hosting-client-timesheet-app.git
cd hosting-client-timesheet-app
```

Familiarize yourself with the directory structure:

```
hosting-client-timesheet-app/
├── docker/                      # Docker config for EC2 deployment
│   ├── Dockerfile               # Multi-stage build (frontend + backend)
│   └── overrides/
│       ├── server.js            # Express server (serves API + static frontend)
│       └── database/init.js     # File-based SQLite initialization
├── lambda/                      # Serverless function for Lambda deployment
│   ├── lambda.js                # Express app wrapped with serverless-http
│   ├── local-server.js          # Local dev server (SQLite in-memory)
│   ├── database/                # DB abstraction (SQLite / DynamoDB)
│   └── package.json
├── terraform/
│   ├── bootstrap/               # One-time foundational AWS resources
│   ├── infrastructure/          # EC2 deployment resources
│   └── serverless/              # Lambda + API Gateway + S3 + DynamoDB resources
└── README.md
```

---

## 4. Bootstrap AWS Infrastructure (Required for Both Modes)

The bootstrap step provisions shared foundational resources used by both deployment modes. This only needs to be run **once per AWS account**.

**What it creates:**
- S3 bucket for Terraform remote state (`client-timesheet-terraform-state-<ACCOUNT_ID>`)
- DynamoDB table for Terraform state locking (`client-timesheet-terraform-locks`)
- ECR repository for Docker images (`client-timesheet-app`)
- GitHub Actions OIDC provider (for CI/CD)
- IAM role for GitHub Actions deployments

### Step 4.1: Navigate to the bootstrap directory

```bash
cd terraform/bootstrap
```

### Step 4.2: Initialize Terraform

```bash
terraform init
```

### Step 4.3: Review the plan

```bash
terraform plan
```

Review the output to confirm the resources that will be created.

### Step 4.4: Apply the bootstrap infrastructure

```bash
terraform apply
```

Type `yes` when prompted to confirm.

### Step 4.5: Save the outputs

After the apply completes, note down the outputs. You will need them in later steps:

```bash
terraform output
```

Expected outputs:

| Output | Description | Used By |
|--------|-------------|---------|
| `terraform_state_bucket` | S3 bucket name for Terraform state | Infrastructure & Serverless modules |
| `ecr_repository_url` | ECR repository URL (e.g., `<ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/client-timesheet-app`) | EC2 deployment |
| `github_actions_role_arn` | IAM role ARN for GitHub Actions | CI/CD pipelines |
| `aws_account_id` | Your AWS account ID | Reference |

Save these values, for example:

```bash
export ECR_REPOSITORY_URL=$(terraform output -raw ecr_repository_url)
export ECR_REPOSITORY_ARN="arn:aws:ecr:us-east-1:$(terraform output -raw aws_account_id):repository/client-timesheet-app"
```

Return to the repository root:

```bash
cd ../..
```

---

## 5. Choose Your Deployment Mode

### EC2 Container Mode (Option A)

- **Best for**: Simple deployments, consistent single-endpoint access
- **How it works**: A Docker container runs on an EC2 instance. The Express server inside the container serves both the REST API and the static frontend files on port 80 via an Elastic IP
- **Database**: SQLite stored on an EBS volume at `/opt/app/data/timesheet.db`
- **Access**: Single URL - `http://<ELASTIC_IP>`

### Serverless Mode (Option B)

- **Best for**: Cost optimization (scales to zero), separating frontend from backend
- **How it works**: Backend runs as a Lambda function behind API Gateway. Frontend is a static React SPA hosted on S3
- **Database**: DynamoDB (three tables: users, clients, work_entries)
- **Access**: Two URLs - one for the frontend (S3 website) and one for the API (API Gateway)

---

## 6. Option A: EC2 Container Deployment

### Step 6.1: Navigate to the infrastructure directory

```bash
cd terraform/infrastructure
```

### Step 6.2: Update the S3 backend configuration

Before initializing, verify the S3 backend bucket in `main.tf` matches the one created during bootstrap. Open `main.tf` and confirm the `backend "s3"` block has the correct bucket name:

```hcl
backend "s3" {
  bucket         = "client-timesheet-terraform-state-<YOUR_ACCOUNT_ID>"
  key            = "infrastructure/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "client-timesheet-terraform-locks"
  encrypt        = true
}
```

### Step 6.3: Initialize Terraform

```bash
terraform init
```

### Step 6.4: Set required variables

The `ecr_repository_url` and `ecr_repository_arn` variables are required (they have no default values). Set them using the values saved from the bootstrap step:

```bash
export TF_VAR_ecr_repository_url="<ECR_REPOSITORY_URL_FROM_BOOTSTRAP>"
export TF_VAR_ecr_repository_arn="<ECR_REPOSITORY_ARN>"
```

For example:

```bash
export TF_VAR_ecr_repository_url="123456789012.dkr.ecr.us-east-1.amazonaws.com/client-timesheet-app"
export TF_VAR_ecr_repository_arn="arn:aws:ecr:us-east-1:123456789012:repository/client-timesheet-app"
```

### Step 6.5: Review the plan

```bash
terraform plan
```

This will create:
- An EC2 `t3.micro` instance (Free Tier eligible) with a 20GB encrypted gp3 EBS volume
- A security group allowing inbound HTTP (port 80) and HTTPS (port 443) traffic
- An Elastic IP for a static public address
- IAM role with ECR pull and SSM Session Manager permissions
- An instance profile attached to the EC2 instance

### Step 6.6: Apply the infrastructure

```bash
terraform apply
```

Type `yes` when prompted.

### Step 6.7: Get the Elastic IP

Once the apply completes, retrieve the Elastic IP:

```bash
terraform output instance_public_ip
```

Save this IP. The application URL will be `http://<ELASTIC_IP>`.

### Step 6.8: Build and push the Docker image

The EC2 instance is now running, but you need to build and push a Docker image to ECR so the instance can pull and run it.

First, you need the application source code. The Docker build expects `frontend/` and `backend/` directories from the companion app repository:

```bash
cd ../..

# Clone the application source code
git clone https://github.com/Cognition-Partner-Workshops/client-timesheet-app.git /tmp/client-timesheet-app
```

Now build and push the Docker image:

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $TF_VAR_ecr_repository_url

# Build the Docker image (from the app repo, using the hosting repo's Docker config)
docker build \
  -f docker/Dockerfile \
  -t client-timesheet-app:latest \
  /tmp/client-timesheet-app

# Tag and push to ECR
docker tag client-timesheet-app:latest $TF_VAR_ecr_repository_url:latest
docker push $TF_VAR_ecr_repository_url:latest
```

### Step 6.9: Deploy the container on EC2

Connect to the EC2 instance via SSM Session Manager and run the deploy script:

```bash
# Get the instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=client-timesheet-app" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

# Trigger the deployment script remotely via SSM
aws ssm send-command \
  --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters commands=["sudo /opt/app/deploy.sh"] \
  --output text
```

Alternatively, start an interactive session and run the deploy script manually:

```bash
aws ssm start-session --target $INSTANCE_ID
# Once connected:
sudo /opt/app/deploy.sh
```

### Step 6.10: Verify the deployment

Wait a minute or two for the container to start, then check the health endpoint:

```bash
ELASTIC_IP=$(cd terraform/infrastructure && terraform output -raw instance_public_ip)
curl http://$ELASTIC_IP/health
```

Expected response:

```json
{"status":"OK","timestamp":"2026-02-12T14:30:00.000Z"}
```

### EC2 Container Runtime Details

The Docker container runs with these settings (configured in `user_data.sh`):

| Setting | Value |
|---------|-------|
| Port mapping | Host `80` -> Container `3001` |
| Volume mount | `/opt/app/data` -> `/app/data` (for SQLite persistence) |
| `NODE_ENV` | `production` |
| `DATABASE_PATH` | `/app/data/timesheet.db` |
| Restart policy | `unless-stopped` |

Return to the repository root:

```bash
cd ../..
```

---

## 7. Option B: Serverless Deployment

### Step 7.1: Navigate to the serverless directory

```bash
cd terraform/serverless
```

### Step 7.2: Update the S3 backend configuration

Verify the S3 backend bucket in `main.tf` matches the one created during bootstrap (same as EC2 mode, but with a different state key):

```hcl
backend "s3" {
  bucket         = "client-timesheet-terraform-state-<YOUR_ACCOUNT_ID>"
  key            = "serverless/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "client-timesheet-terraform-locks"
  encrypt        = true
}
```

### Step 7.3: Create a Lambda placeholder

Terraform needs a placeholder zip file for the initial Lambda function creation:

```bash
echo "exports.handler = async () => ({ statusCode: 200, body: 'placeholder' });" > /tmp/placeholder.js
cd terraform/serverless
zip lambda-placeholder.zip /tmp/placeholder.js
```

> **Note**: If `lambda-placeholder.zip` already exists in the `terraform/serverless/` directory, skip this step.

### Step 7.4: Initialize Terraform

```bash
terraform init
```

### Step 7.5: Review the plan

```bash
terraform plan
```

This will create:
- Three DynamoDB tables (users, clients, work_entries) with on-demand billing
- An S3 bucket configured for static website hosting (frontend)
- A Lambda function (`client-timesheet-app-api`) with Node.js 20.x runtime
- An HTTP API Gateway as the Lambda proxy
- IAM roles and policies for Lambda to access DynamoDB
- (Optional) SonarQube on ECS Fargate Spot

### Step 7.6: Apply the serverless infrastructure

```bash
terraform apply
```

Type `yes` when prompted.

### Step 7.7: Get the deployment outputs

```bash
terraform output
```

Key outputs:

| Output | Description | Example |
|--------|-------------|---------|
| `api_endpoint` | API Gateway URL for the backend | `https://abc123.execute-api.us-east-1.amazonaws.com` |
| `frontend_url` | S3 static website URL for the frontend | `http://client-timesheet-app-frontend-123456789012.s3-website-us-east-1.amazonaws.com` |
| `lambda_function_name` | Lambda function name for deployments | `client-timesheet-app-api` |
| `frontend_bucket` | S3 bucket name for frontend uploads | `client-timesheet-app-frontend-123456789012` |

Save these values:

```bash
export API_ENDPOINT=$(terraform output -raw api_endpoint)
export FRONTEND_BUCKET=$(terraform output -raw frontend_bucket)
export LAMBDA_FUNCTION=$(terraform output -raw lambda_function_name)
export FRONTEND_URL=$(terraform output -raw frontend_url)
```

### Step 7.8: Deploy the Lambda function

```bash
cd ../..

# Install production dependencies
cd lambda
npm ci --production

# Create deployment package
zip -r ../lambda.zip .

# Deploy to Lambda
cd ..
aws lambda update-function-code \
  --function-name $LAMBDA_FUNCTION \
  --zip-file fileb://lambda.zip

# Wait for the update to complete
aws lambda wait function-updated \
  --function-name $LAMBDA_FUNCTION
```

### Step 7.9: Build and deploy the frontend

Clone the application source code (if not already cloned):

```bash
git clone https://github.com/Cognition-Partner-Workshops/client-timesheet-app.git /tmp/client-timesheet-app
```

Build the frontend with the API endpoint:

```bash
cd /tmp/client-timesheet-app/frontend
npm ci
VITE_API_URL=$API_ENDPOINT npm run build
```

Upload the built frontend to S3:

```bash
aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete
```

### Step 7.10: Verify the deployment

Check the API health endpoint:

```bash
curl $API_ENDPOINT/health
```

Expected response:

```json
{"status":"OK","mode":"dynamodb","timestamp":"2026-02-12T14:30:00.000Z"}
```

Open the frontend in your browser:

```bash
echo "Frontend URL: $FRONTEND_URL"
```

Return to the repository root:

```bash
cd /path/to/hosting-client-timesheet-app
```

---

## 8. Accessing the Application

### EC2 Mode

Open your browser and navigate to:

```
http://<ELASTIC_IP>
```

The Express server serves both the API and the frontend from a single endpoint. API routes are under `/api/*` and the frontend is served for all other routes.

### Serverless Mode

- **Frontend**: Open the `frontend_url` from Terraform output in your browser
- **API**: The frontend automatically connects to the `api_endpoint` (configured at build time via `VITE_API_URL`)

### Using the Application

1. Enter your email address on the login page (no password required)
2. Create clients by navigating to the Clients section
3. Log work entries by selecting a client and entering hours, description, and date
4. View and manage all your entries from the dashboard

> **Note**: HTTPS is not configured by default. The application serves HTTP traffic only. For production use, consider adding an Application Load Balancer with an ACM certificate (EC2 mode) or CloudFront (serverless mode).

---

## 9. Teardown / Cleanup

### Destroy EC2 Infrastructure

```bash
cd terraform/infrastructure
export TF_VAR_ecr_repository_url="<YOUR_ECR_REPOSITORY_URL>"
export TF_VAR_ecr_repository_arn="<YOUR_ECR_REPOSITORY_ARN>"
terraform destroy
```

### Destroy Serverless Infrastructure

```bash
cd terraform/serverless
terraform destroy
```

### Destroy Bootstrap Resources (Last)

Only destroy bootstrap resources after all other infrastructure has been torn down:

```bash
cd terraform/bootstrap
terraform destroy
```

---

## 10. Troubleshooting

### EC2: Access the Instance via SSM Session Manager

The EC2 instance does **not** use SSH. Instead, use AWS Systems Manager Session Manager for access:

```bash
# Get the instance ID
INSTANCE_ID=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=client-timesheet-app" "Name=instance-state-name,Values=running" \
  --query 'Reservations[0].Instances[0].InstanceId' \
  --output text)

# Start an interactive session
aws ssm start-session --target $INSTANCE_ID
```

You can also connect via the AWS Console: **EC2 > Instances > Select instance > Connect > Session Manager**.

> **Requirement**: You must have the [Session Manager Plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) installed for the AWS CLI.

### EC2: View Container Logs

Once connected to the instance via SSM:

```bash
# Check if the container is running
docker ps

# View container logs
docker logs client-timesheet-app

# View the EC2 user data initialization log
sudo cat /var/log/user-data.log
```

### EC2: Manually Redeploy the Container

```bash
# Via SSM session on the instance:
sudo /opt/app/deploy.sh
```

### EC2: Container Not Starting

If the container is not running after deployment:

```bash
# Check Docker status
sudo systemctl status docker

# Check if the image was pulled successfully
docker images

# Try running the container manually for debugging
docker run --rm -it \
  -p 80:3001 \
  -e NODE_ENV=production \
  -e DATABASE_PATH=/app/data/timesheet.db \
  <ECR_REPOSITORY_URL>:latest
```

### Serverless: Lambda Function Errors

```bash
# View recent Lambda invocation logs
aws logs tail /aws/lambda/client-timesheet-app-api --since 1h

# Invoke the health endpoint directly
aws lambda invoke \
  --function-name client-timesheet-app-api \
  --payload '{"httpMethod":"GET","path":"/health","requestContext":{"http":{"method":"GET","path":"/health"}}}' \
  /tmp/lambda-response.json
cat /tmp/lambda-response.json
```

### Serverless: Frontend Not Loading

- Verify the S3 bucket has website hosting enabled: `aws s3api get-bucket-website --bucket $FRONTEND_BUCKET`
- Ensure the bucket policy allows public read access
- Check that `VITE_API_URL` was set correctly during the frontend build

### Terraform State Issues

If you get state locking errors:

```bash
# Force unlock (use with caution)
terraform force-unlock <LOCK_ID>
```

If the S3 backend is inaccessible, verify your AWS credentials and the bucket name in `main.tf`.

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `terraform init` fails with backend error | S3 bucket doesn't exist | Run bootstrap first (Step 4) |
| EC2 instance unreachable | Security group or Elastic IP issue | Check security group allows port 80 inbound |
| Container exits immediately | Application error or missing env vars | Check `docker logs client-timesheet-app` |
| Lambda returns 502 | Cold start timeout or code error | Increase `lambda_timeout` variable, check CloudWatch logs |
| Frontend shows blank page | Build error or wrong API URL | Rebuild with correct `VITE_API_URL` and re-sync to S3 |
| SSM Session fails | SSM agent not running or IAM issue | Verify IAM instance profile has `AmazonSSMManagedInstanceCore` policy |
