# =============================================================================
# Client Timesheet Application - Bootstrap Module
# =============================================================================
#
# This Terraform module creates foundational AWS resources that support the
# infrastructure deployment pipeline. It should be applied ONCE before the
# infrastructure module and rarely needs modification afterward.
#
# Resources Created:
#   - S3 bucket for Terraform remote state storage
#   - DynamoDB table for Terraform state locking
#   - ECR repository for Docker image storage
#   - GitHub Actions OIDC provider for secure CI/CD authentication
#   - IAM role with least-privilege permissions for deployments
#
# Why Separate from Infrastructure:
#   Bootstrap resources support Terraform itself (state storage) and must
#   exist before other infrastructure can be provisioned. Keeping them
#   separate allows independent lifecycle management.
#
# Usage:
#   cd terraform/bootstrap
#   terraform init
#   terraform apply
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
}

provider "aws" {
  region = var.aws_region
}

# Current AWS account ID used for resource naming and ARN construction
data "aws_caller_identity" "current" {}

# Common tags applied to all resources for cost tracking and organization
locals {
  account_id = data.aws_caller_identity.current.account_id
  tags = {
    Environment = "shared"
    Project     = "client-timesheet-app"
    ManagedBy   = "terraform-bootstrap"
  }
}

# =============================================================================
# Terraform State Backend Resources
# =============================================================================
# S3 bucket and DynamoDB table provide remote state management with:
#   - Versioning for state history and recovery
#   - Encryption at rest for security
#   - Locking to prevent concurrent modifications

resource "aws_s3_bucket" "terraform_state" {
  bucket = "client-timesheet-terraform-state-${local.account_id}"

  # Set to false to allow destruction - change to true for production
  force_destroy = var.allow_destroy

  tags = merge(local.tags, {
    Name = "Terraform State Bucket"
  })
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# =============================================================================
# GitHub Actions OIDC Provider and Deployment Role
# =============================================================================
# OIDC (OpenID Connect) enables GitHub Actions to authenticate with AWS
# without storing long-lived credentials. The workflow receives a short-lived
# JWT token that AWS validates against the OIDC provider.
#
# Security Benefits:
#   - No static AWS access keys stored in GitHub secrets
#   - Tokens are short-lived and automatically rotated
#   - Trust is scoped to specific GitHub repository

resource "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub's OIDC thumbprint
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = merge(local.tags, {
    Name = "GitHub Actions OIDC Provider"
  })
}

# IAM Role assumed by GitHub Actions workflows via OIDC
# Trust policy restricts assumption to the specific GitHub repository
resource "aws_iam_role" "github_actions_deploy" {
  name = "client-timesheet-github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_org}/${var.github_repo}:*"
          }
        }
      }
    ]
  })

  tags = merge(local.tags, {
    Name = "GitHub Actions Deploy Role"
  })
}

# ECR Push/Pull Policy - allows CI/CD to build and push Docker images
# Scoped to the specific ECR repository for least-privilege security
resource "aws_iam_role_policy" "github_actions_ecr" {
  name = "ecr-push-pull"
  role = aws_iam_role.github_actions_deploy.id

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
        Sid    = "ECRPushPull"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        Resource = aws_ecr_repository.app.arn
      }
    ]
  })
}

# EC2 Describe Policy - allows CI/CD to find the target instance by tag
# Required for SSM deployment commands to identify the correct instance
resource "aws_iam_role_policy" "github_actions_ec2" {
  name = "ec2-describe"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EC2DescribeInstances"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ec2:ResourceTag/Project" = "client-timesheet-app"
          }
        }
      },
      {
        Sid    = "EC2DescribeAll"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances"
        ]
        Resource = "*"
      }
    ]
  })
}

# SSM Send Command Policy - enables remote deployment execution
# Allows CI/CD to trigger the deploy.sh script on the EC2 instance
resource "aws_iam_role_policy" "github_actions_ssm" {
  name = "ssm-send-command"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SSMSendCommand"
        Effect = "Allow"
        Action = [
          "ssm:SendCommand"
        ]
        Resource = [
          "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript",
          "arn:aws:ec2:${var.aws_region}:${local.account_id}:instance/*"
        ]
        Condition = {
          StringEquals = {
            "ssm:resourceTag/Project" = "client-timesheet-app"
          }
        }
      },
      {
        Sid    = "SSMGetCommandInvocation"
        Effect = "Allow"
        Action = [
          "ssm:GetCommandInvocation"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "client-timesheet-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = merge(local.tags, {
    Name = "Terraform Lock Table"
  })
}

# =============================================================================
# ECR Repository
# =============================================================================
# Elastic Container Registry stores Docker images built by the CI/CD pipeline.
# Images are tagged with 'latest' and pulled by the EC2 instance during deployment.

resource "aws_ecr_repository" "app" {
  name                 = "client-timesheet-app"
  image_tag_mutability = "MUTABLE"
  force_delete         = var.allow_destroy

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = merge(local.tags, {
    Name = "Client Timesheet App ECR"
  })
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
