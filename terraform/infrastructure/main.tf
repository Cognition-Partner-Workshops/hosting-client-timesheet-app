# =============================================================================
# Client Timesheet Application - Infrastructure Module
# =============================================================================
#
# This Terraform module provisions the core AWS infrastructure for running
# the Client Timesheet Application on a single EC2 instance. It is designed
# for cost-effectiveness (~$10-15/month) rather than high availability.
#
# Resources Created:
#   - EC2 t3.micro instance running Docker
#   - Security group allowing HTTP/HTTPS traffic
#   - Elastic IP for consistent public addressing
#   - IAM role and instance profile for ECR access and SSM
#
# Prerequisites:
#   - Bootstrap module must be applied first (creates S3, ECR, OIDC)
#   - ECR repository URL and ARN from bootstrap outputs
#
# Usage:
#   cd terraform/infrastructure
#   terraform init
#   terraform apply -var="ecr_repository_url=<URL>" -var="ecr_repository_arn=<ARN>"
#
# =============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state storage in S3 with DynamoDB locking
  # Bucket and table are created by the bootstrap module
  backend "s3" {
    bucket         = "client-timesheet-terraform-state-599083837640"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "client-timesheet-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# =============================================================================
# Data Sources
# =============================================================================

# Current AWS account information for resource naming and ARN construction
data "aws_caller_identity" "current" {}

# Available AZs in the region for subnet placement
data "aws_availability_zones" "available" {
  state = "available"
}

# Latest Amazon Linux 2023 AMI for EC2 instance
# Using AL2023 for long-term support and modern kernel features
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# =============================================================================
# VPC and Networking
# =============================================================================
# Uses the default VPC and subnet for simplicity and cost savings.
# For production workloads requiring isolation, consider creating a custom VPC.

resource "aws_default_vpc" "default" {
  tags = {
    Name = "Default VPC"
  }
}

resource "aws_default_subnet" "default" {
  availability_zone = data.aws_availability_zones.available.names[0]

  tags = {
    Name = "Default Subnet"
  }
}

# =============================================================================
# Security Group
# =============================================================================
# Defines network access rules for the EC2 instance. Only HTTP/HTTPS traffic
# is allowed inbound. SSH is intentionally omitted - use SSM Session Manager
# for secure, audited shell access without exposing port 22.

resource "aws_security_group" "app" {
  name        = "client-timesheet-app-sg"
  description = "Security group for Client Timesheet App"
  vpc_id      = aws_default_vpc.default.id

  # HTTP access - primary application traffic
  # Consider adding an ALB with ACM certificate for HTTPS termination
  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS access - reserved for future SSL/TLS implementation
  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Security Note: SSH (port 22) is intentionally NOT opened.
  # Access the instance via AWS SSM Session Manager which provides:
  #   - IAM-based authentication (no SSH keys to manage)
  #   - Full audit logging in CloudTrail
  #   - No exposed network ports

  # Allow all outbound traffic for package updates, ECR pulls, etc.
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "client-timesheet-app-sg"
    Environment = var.environment
    Project     = "client-timesheet-app"
  }
}

# =============================================================================
# IAM Role and Policies
# =============================================================================
# The EC2 instance requires an IAM role to:
#   1. Pull Docker images from ECR
#   2. Register with SSM for Session Manager access
# This follows the principle of least privilege - only necessary permissions.

resource "aws_iam_role" "ec2_role" {
  name = "client-timesheet-ec2-role"

  # Trust policy allowing EC2 service to assume this role
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "client-timesheet-ec2-role"
    Environment = var.environment
    Project     = "client-timesheet-app"
  }
}

# ECR access policy - allows the instance to pull Docker images
# Scoped to the specific ECR repository for security
resource "aws_iam_role_policy" "ecr_policy" {
  name = "ecr-access-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECRGetAuthToken"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "ECRPullImages"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = var.ecr_repository_arn
      }
    ]
  })
}

# SSM managed policy attachment - enables Session Manager access
# This AWS-managed policy provides the minimum permissions for SSM agent
resource "aws_iam_role_policy_attachment" "ssm_managed_instance" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Instance profile wraps the IAM role for EC2 attachment
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "client-timesheet-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# =============================================================================
# EC2 Instance
# =============================================================================
# The main compute resource running the Docker container. Uses t3.micro for
# cost efficiency (free tier eligible). The instance is initialized via
# user_data.sh which installs Docker and configures the deployment script.

resource "aws_instance" "app" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  vpc_security_group_ids = [aws_security_group.app.id]
  subnet_id              = aws_default_subnet.default.id
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  # 20GB encrypted root volume for OS, Docker images, and application data
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  # User data script installs Docker, SSM agent, and creates deployment scripts
  # Variables are interpolated into the script via Terraform templatefile
  user_data = base64encode(templatefile("${path.module}/user_data.sh", {
    aws_region     = var.aws_region
    ecr_repository = var.ecr_repository_url
    app_port       = var.app_port
  }))

  tags = {
    Name        = "client-timesheet-app"
    Environment = var.environment
    Project     = "client-timesheet-app"
  }

  # Create new instance before destroying old one during updates
  # Minimizes downtime during infrastructure changes
  lifecycle {
    create_before_destroy = true
  }
}

# =============================================================================
# Elastic IP
# =============================================================================
# Provides a static public IP address that persists across instance replacements.
# This ensures the application URL remains consistent even after infrastructure
# updates or instance recreation.

resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name        = "client-timesheet-app-eip"
    Environment = var.environment
    Project     = "client-timesheet-app"
  }
}
