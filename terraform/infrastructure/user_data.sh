#!/bin/bash
# =============================================================================
# EC2 Instance Initialization Script (User Data)
# =============================================================================
#
# This script runs once when the EC2 instance first launches. It configures
# the instance to run the Client Timesheet Application as a Docker container.
#
# What This Script Does:
#   1. Updates system packages for security patches
#   2. Installs and configures SSM Agent for secure shell access
#   3. Installs Docker for container runtime
#   4. Creates the deployment script (/opt/app/deploy.sh)
#   5. Sets up a systemd service for automatic container management
#
# Terraform Variables (interpolated at apply time):
#   - ${aws_region}: AWS region for ECR authentication
#   - ${ecr_repository}: Full ECR repository URL for Docker images
#   - ${app_port}: Application port inside the container
#
# Logs: /var/log/user-data.log
#
# =============================================================================

set -e

# Redirect all output to log file and console for debugging
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "Starting user data script..."

# =============================================================================
# System Updates
# =============================================================================
# Apply latest security patches and package updates
dnf update -y

# =============================================================================
# SSM Agent Installation
# =============================================================================
# SSM Agent enables AWS Systems Manager Session Manager access, providing
# secure shell access without opening SSH ports or managing SSH keys
dnf install -y amazon-ssm-agent
systemctl enable amazon-ssm-agent
systemctl start amazon-ssm-agent

# =============================================================================
# Docker Installation
# =============================================================================
# Docker provides the container runtime for the application
dnf install -y docker
systemctl start docker
systemctl enable docker

# Allow ec2-user to run Docker commands without sudo
usermod -aG docker ec2-user

# =============================================================================
# AWS CLI Installation
# =============================================================================
# Required for ECR authentication (usually pre-installed on AL2023)
dnf install -y aws-cli

# =============================================================================
# Application Directory Setup
# =============================================================================
# /opt/app: Contains deployment scripts
# /opt/app/data: Persistent storage for SQLite database (mounted into container)
mkdir -p /opt/app
mkdir -p /opt/app/data

# =============================================================================
# Deployment Script
# =============================================================================
# This script is executed by GitHub Actions via SSM to deploy new versions.
# It performs a rolling update: pull new image, stop old container, start new.
cat > /opt/app/deploy.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
set -e

# Configuration (interpolated by Terraform)
AWS_REGION="${aws_region}"
ECR_REPOSITORY="${ecr_repository}"
APP_PORT="${app_port}"

# Step 1: Authenticate with ECR
echo "Logging into ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY

# Step 2: Pull the latest Docker image
echo "Pulling latest image..."
docker pull $ECR_REPOSITORY:latest

# Step 3: Stop and remove the existing container (if running)
echo "Stopping existing container..."
docker stop client-timesheet-app 2>/dev/null || true
docker rm client-timesheet-app 2>/dev/null || true

# Step 4: Start the new container
# - Maps port 80 (host) to app port (container) for HTTP traffic
# - Mounts /opt/app/data for SQLite database persistence
# - Sets production environment variables
echo "Starting new container..."
docker run -d \
  --name client-timesheet-app \
  --restart unless-stopped \
  -p 80:$APP_PORT \
  -v /opt/app/data:/app/data \
  -e NODE_ENV=production \
  -e PORT=$APP_PORT \
  -e DATABASE_PATH=/app/data/timesheet.db \
  $ECR_REPOSITORY:latest

# Step 5: Clean up unused Docker images to save disk space
echo "Cleaning up old images..."
docker image prune -f

echo "Deployment complete!"
DEPLOY_SCRIPT

chmod +x /opt/app/deploy.sh

# =============================================================================
# Systemd Service Configuration
# =============================================================================
# Creates a systemd service that:
# - Starts the application on boot (after Docker is ready)
# - Provides start/stop commands via systemctl
# - Ensures the container restarts if the instance reboots
cat > /etc/systemd/system/client-timesheet-app.service << 'SERVICE'
[Unit]
Description=Client Timesheet App
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/opt/app/deploy.sh
ExecStop=/usr/bin/docker stop client-timesheet-app

[Install]
WantedBy=multi-user.target
SERVICE

# Reload systemd to recognize the new service and enable it for boot
systemctl daemon-reload
systemctl enable client-timesheet-app

echo "User data script completed successfully!"
