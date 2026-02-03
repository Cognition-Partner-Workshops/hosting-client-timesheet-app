# Client Timesheet Application - Functional Documentation

This document provides a comprehensive functional overview of the Client Timesheet Application hosting infrastructure, explaining each component's purpose, how they interact, and the overall system architecture.

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [System Architecture](#2-system-architecture)
3. [Application Layer](#3-application-layer)
4. [Database Layer](#4-database-layer)
5. [Container Layer](#5-container-layer)
6. [Infrastructure Layer](#6-infrastructure-layer)
7. [CI/CD Pipeline](#7-cicd-pipeline)
8. [Security Architecture](#8-security-architecture)
9. [Deployment Workflow](#9-deployment-workflow)
10. [Operational Procedures](#10-operational-procedures)

---

## 1. Application Overview

### Purpose

The Client Timesheet Application is a full-stack web application designed for tracking time spent on client work. It enables freelancers, consultants, and small teams to manage clients, log work entries with hours and descriptions, and generate reports on time spent across projects.

### Target Users

The application is built for individual users or small teams who need a simple, cost-effective time tracking solution. The infrastructure is designed to minimize operational costs (approximately $10-15/month) while providing reliable service for low to moderate traffic workloads.

### Core Functionality

The application provides four main functional areas through its API:

**Authentication (`/api/auth`)**: Handles user registration and login using email-based authentication. Users are identified by their email address, which serves as the primary key in the database.

**Client Management (`/api/clients`)**: Enables users to create, read, update, and delete client profiles. Each client has a name, optional description, and is associated with the user who created it.

**Work Entry Tracking (`/api/work-entries`)**: Allows users to log time entries against specific clients. Each entry includes the number of hours worked, a description of the work performed, and the date the work was completed.

**Reporting (`/api/reports`)**: Generates summaries and analytics on time spent across clients and date ranges, helping users understand their time allocation and prepare invoices.

---

## 2. System Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS CLOUD (us-east-1)                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        ELASTIC IP                                      │  │
│  │                    (Static Public Address)                             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     SECURITY GROUP                                     │  │
│  │              (HTTP:80, HTTPS:443 allowed)                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    EC2 INSTANCE (t3.micro)                             │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    DOCKER CONTAINER                              │  │  │
│  │  │  ┌───────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │              EXPRESS.JS SERVER (Port 3001)                 │  │  │  │
│  │  │  │  ┌─────────────────┐  ┌─────────────────────────────────┐ │  │  │  │
│  │  │  │  │  React Frontend │  │         API Routes              │ │  │  │  │
│  │  │  │  │  (Static Files) │  │  /api/auth, /api/clients,       │ │  │  │  │
│  │  │  │  │                 │  │  /api/work-entries, /api/reports│ │  │  │  │
│  │  │  │  └─────────────────┘  └─────────────────────────────────┘ │  │  │  │
│  │  │  └───────────────────────────────────────────────────────────┘  │  │  │
│  │  │                              │                                   │  │  │
│  │  │                              ▼                                   │  │  │
│  │  │  ┌───────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │              SQLite DATABASE                               │  │  │  │
│  │  │  │         /app/data/timesheet.db                             │  │  │  │
│  │  │  └───────────────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                              │                                         │  │
│  │                              ▼                                         │  │
│  │  ┌───────────────────────────────────────────────────────────────────┐│  │
│  │  │              EBS VOLUME (20GB gp3, encrypted)                     ││  │
│  │  │         /opt/app/data (mounted into container)                    ││  │
│  │  └───────────────────────────────────────────────────────────────────┘│  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    SUPPORTING SERVICES                                 │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │     ECR     │  │     S3      │  │  DynamoDB   │  │     SSM     │  │  │
│  │  │   (Docker   │  │ (Terraform  │  │ (Terraform  │  │  (Session   │  │  │
│  │  │   Images)   │  │   State)    │  │   Locks)    │  │  Manager)   │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Design Philosophy

The architecture prioritizes cost-effectiveness and simplicity over high availability. By running on a single EC2 instance with SQLite, the application minimizes operational costs while accepting some downtime risk. This design is ideal for individual users or small teams with budget constraints who can tolerate occasional brief outages.

---

## 3. Application Layer

### Express.js Server

The application server is built with Express.js and serves as the central hub for all application functionality. It handles both API requests and serves the React frontend as static files in production.

**Location**: `docker/overrides/server.js`

#### Request Processing Pipeline

When a request arrives at the server, it passes through several middleware layers before reaching the route handlers:

1. **Security Headers (Helmet)**: Applies Content Security Policy and other security headers to protect against XSS and other attacks. The CSP is configured to allow React's runtime requirements while blocking potentially malicious content.

2. **CORS Handling**: In production, allows same-origin requests since frontend and backend are served from the same server. In development, allows requests from the Vite dev server.

3. **Rate Limiting**: Restricts each IP address to 100 requests per 15-minute window, providing basic DDoS protection while allowing normal usage patterns.

4. **Request Logging (Morgan)**: Logs all incoming requests in Apache combined format for debugging and monitoring.

5. **Body Parsing**: Parses JSON request bodies up to 10MB and URL-encoded form data.

#### API Route Structure

The server exposes four main API route groups, each handling a specific domain:

| Route Prefix | Module | Purpose |
|--------------|--------|---------|
| `/api/auth` | `authRoutes` | User authentication (login, registration) |
| `/api/clients` | `clientRoutes` | Client CRUD operations |
| `/api/work-entries` | `workEntryRoutes` | Time entry management |
| `/api/reports` | `reportRoutes` | Report generation and analytics |

#### Static File Serving

In production mode (`NODE_ENV=production`), the server serves the compiled React frontend from the `/app/public` directory. A catch-all route ensures that client-side routing works correctly by serving `index.html` for all non-API routes.

#### Health Check Endpoint

The `/health` endpoint provides a lightweight way for container orchestration and deployment scripts to verify the server is operational. It returns a JSON response with the current status and timestamp.

---

## 4. Database Layer

### SQLite Database

The application uses SQLite for data persistence, providing a lightweight, serverless database solution that requires no separate database server.

**Location**: `docker/overrides/database/init.js`

#### Database Schema

The database consists of three interconnected tables:

**Users Table**
```sql
CREATE TABLE users (
    email TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```
The users table stores user accounts with email as the primary identifier. This simple schema supports the email-only authentication model.

**Clients Table**
```sql
CREATE TABLE clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    user_email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
)
```
Each client belongs to a user (via `user_email` foreign key) and has a name and optional description. Cascade delete ensures that when a user is deleted, their clients are also removed.

**Work Entries Table**
```sql
CREATE TABLE work_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    user_email TEXT NOT NULL,
    hours DECIMAL(5,2) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
    FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
)
```
Work entries record time spent on client work, linking to both the client and user. The dual foreign keys ensure data integrity and enable cascade deletes.

#### Database Indexes

Four indexes optimize common query patterns:

| Index Name | Column | Purpose |
|------------|--------|---------|
| `idx_clients_user_email` | `clients.user_email` | Fast lookup of all clients for a user |
| `idx_work_entries_client_id` | `work_entries.client_id` | Fast lookup of entries for a client |
| `idx_work_entries_user_email` | `work_entries.user_email` | Fast lookup of entries for a user |
| `idx_work_entries_date` | `work_entries.date` | Fast date-range queries for reports |

#### Connection Management

The database module implements the singleton pattern to ensure only one database connection exists throughout the application lifecycle. The `getDatabase()` function returns the existing connection or creates a new one if needed.

#### Storage Modes

The database supports two storage modes controlled by the `DATABASE_PATH` environment variable:

- **File-based (Production)**: When `DATABASE_PATH` is set to a file path (e.g., `/app/data/timesheet.db`), data persists across container restarts via a mounted volume.

- **In-memory (Development/Testing)**: When `DATABASE_PATH` is `:memory:` or unset, the database exists only in memory and is lost when the process exits.

---

## 5. Container Layer

### Docker Configuration

The application is containerized using a multi-stage Docker build that optimizes the final image size while maintaining all necessary functionality.

**Location**: `docker/Dockerfile`

#### Build Stages

**Stage 1: Frontend Builder**
This stage compiles the React frontend application using Vite. It installs all frontend dependencies (including dev dependencies needed for building) and runs the build process. The output is a set of static files (HTML, CSS, JavaScript) in the `dist` directory.

**Stage 2: Backend Builder**
This stage installs only production dependencies for the Express backend. By excluding development dependencies, it reduces the final image size significantly.

**Stage 3: Production Runtime**
The final stage creates the production image by:
- Starting from a minimal Node.js Alpine image
- Installing `dumb-init` for proper signal handling
- Creating a non-root user for security
- Copying only the necessary files from builder stages
- Applying production overrides for server configuration
- Setting up the data directory for SQLite persistence

#### Security Features

**Non-root User**: The container runs as a non-root user (`nodejs`) to limit potential damage from security vulnerabilities.

**dumb-init**: Acts as PID 1 and properly forwards signals (SIGTERM, SIGINT) to the Node.js process, enabling graceful shutdown.

**Health Check**: The container includes a health check that verifies the `/health` endpoint responds correctly, allowing container orchestration systems to detect and restart unhealthy containers.

#### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `production` | Enables production optimizations |
| `PORT` | `3001` | Application listening port |
| `DATABASE_PATH` | `/app/data/timesheet.db` | SQLite database file location |

---

## 6. Infrastructure Layer

### Terraform Modules

The infrastructure is managed through two Terraform modules with distinct responsibilities:

#### Bootstrap Module

**Location**: `terraform/bootstrap/`

The bootstrap module creates foundational AWS resources that support the infrastructure deployment pipeline. It should be applied once before the infrastructure module and rarely needs modification afterward.

**Resources Created**:

| Resource | Purpose |
|----------|---------|
| S3 Bucket | Stores Terraform state files with versioning and encryption |
| DynamoDB Table | Provides distributed locking for Terraform operations |
| ECR Repository | Stores Docker images built by the CI/CD pipeline |
| OIDC Provider | Enables GitHub Actions to authenticate without static credentials |
| IAM Role | Grants least-privilege permissions for CI/CD deployments |

**Why Separate**: Bootstrap resources support Terraform itself (state storage) and must exist before other infrastructure can be provisioned. Keeping them separate allows independent lifecycle management and prevents circular dependencies.

#### Infrastructure Module

**Location**: `terraform/infrastructure/`

The infrastructure module provisions the application-specific AWS resources that run the actual application.

**Resources Created**:

| Resource | Purpose |
|----------|---------|
| EC2 Instance | Runs the Docker container with the application |
| Security Group | Controls network access (HTTP/HTTPS only) |
| Elastic IP | Provides a static public IP address |
| IAM Role | Grants EC2 permissions for ECR and SSM |
| Instance Profile | Attaches IAM role to EC2 instance |

### EC2 Instance Configuration

The EC2 instance is configured through the `user_data.sh` script, which runs once when the instance first launches.

**Location**: `terraform/infrastructure/user_data.sh`

**Initialization Steps**:

1. **System Updates**: Applies latest security patches
2. **SSM Agent**: Enables secure shell access without SSH
3. **Docker**: Installs container runtime
4. **AWS CLI**: Required for ECR authentication
5. **Deployment Script**: Creates `/opt/app/deploy.sh` for automated deployments
6. **Systemd Service**: Configures automatic container management on boot

### Networking

The application uses the default VPC and subnet for simplicity. The security group allows:

- **Inbound**: HTTP (port 80) and HTTPS (port 443) from anywhere
- **Outbound**: All traffic (for package updates, ECR pulls, etc.)

SSH access is intentionally not configured. Instead, AWS SSM Session Manager provides secure shell access with IAM-based authentication and full audit logging.

---

## 7. CI/CD Pipeline

### GitHub Actions Workflow

The deployment pipeline is triggered automatically on pushes to the `main` branch or can be manually triggered via workflow dispatch.

#### Pipeline Stages

**1. Build and Push**
- Checks out the application code from the source repository
- Authenticates with AWS using OIDC (no static credentials)
- Builds the Docker image using the multi-stage Dockerfile
- Pushes the image to ECR with the `latest` tag

**2. Deploy**
- Identifies the target EC2 instance by tag
- Executes the deployment script via SSM Run Command
- The deployment script pulls the new image and performs a rolling update

**3. Health Check**
- Waits for the container to start
- Verifies the `/health` endpoint responds correctly
- Reports deployment success or failure

#### Security Features

**OIDC Authentication**: GitHub Actions uses OpenID Connect to obtain temporary AWS credentials. This eliminates the need for long-lived access keys stored in GitHub secrets.

**SSM Deployment**: Deployments are executed via AWS Systems Manager, which provides audit logging and doesn't require SSH access to the instance.

**Least Privilege**: The deployment IAM role has only the minimum permissions required for its tasks, scoped to specific resources where possible.

---

## 8. Security Architecture

### Authentication and Access Control

**Application Authentication**: The application uses email-only authentication. While simple, this should be enhanced with proper password hashing or OAuth for production use.

**AWS Authentication**: All AWS access uses IAM roles with least-privilege permissions:
- GitHub Actions uses OIDC for temporary credentials
- EC2 instance uses an instance profile with scoped permissions

**Instance Access**: SSH is disabled. Shell access is provided through SSM Session Manager, which:
- Uses IAM for authentication
- Provides full audit logging in CloudTrail
- Doesn't require open network ports

### Network Security

**Security Group Rules**: Only HTTP and HTTPS traffic is allowed inbound. All other ports are blocked, including SSH.

**Encryption**: 
- EBS volume is encrypted at rest
- S3 bucket uses server-side encryption
- Terraform state is encrypted

### Content Security Policy

The Express server configures Helmet.js with a Content Security Policy that:
- Restricts script sources to same-origin and inline (required for React)
- Allows styles from same-origin, inline, and Google Fonts
- Restricts image sources to same-origin, data URIs, and blobs
- Limits connections to same-origin only

---

## 9. Deployment Workflow

### Initial Setup

1. **Apply Bootstrap Module**
   ```bash
   cd terraform/bootstrap
   terraform init
   terraform apply
   ```
   Save the outputs for the next steps.

2. **Configure GitHub Secrets**
   - `AWS_ROLE_ARN`: From bootstrap output
   - `ECR_REPOSITORY_URL`: From bootstrap output
   - `ECR_REPOSITORY_ARN`: From bootstrap output
   - `GH_PAT`: GitHub Personal Access Token

3. **Apply Infrastructure Module**
   ```bash
   cd terraform/infrastructure
   terraform init
   terraform apply \
     -var="ecr_repository_url=<URL>" \
     -var="ecr_repository_arn=<ARN>"
   ```

4. **Trigger First Deployment**
   Push to the `main` branch or manually trigger the workflow.

### Ongoing Deployments

After initial setup, deployments are automatic:

1. Developer pushes code to `main` branch
2. GitHub Actions workflow triggers
3. Docker image is built and pushed to ECR
4. SSM command triggers deployment on EC2
5. Health check verifies successful deployment

### Rollback Procedure

To rollback to a previous version:

1. Access the EC2 instance via SSM Session Manager
2. List available images: `docker images`
3. Stop current container: `docker stop client-timesheet-app`
4. Remove current container: `docker rm client-timesheet-app`
5. Start previous image version with the same run command

---

## 10. Operational Procedures

### Monitoring

**Container Logs**:
```bash
# Via SSM session
docker logs client-timesheet-app
docker logs -f client-timesheet-app  # Follow logs
```

**User Data Logs** (instance initialization):
```bash
sudo cat /var/log/user-data.log
```

**Application Health**:
```bash
curl http://localhost/health
```

### Troubleshooting

**Container Not Running**:
```bash
docker ps -a  # Check container status
docker logs client-timesheet-app  # Check for errors
sudo /opt/app/deploy.sh  # Redeploy
```

**Database Issues**:
```bash
# Check database file exists
ls -la /opt/app/data/
# Check database permissions
docker exec client-timesheet-app ls -la /app/data/
```

**Deployment Failures**:
1. Check GitHub Actions workflow logs
2. Verify ECR image was pushed successfully
3. Check SSM command execution in AWS Console
4. Review container logs for startup errors

### Backup and Recovery

**Database Backup**:
```bash
# Via SSM session
cp /opt/app/data/timesheet.db /opt/app/data/timesheet.db.backup
```

**Restore from Backup**:
```bash
docker stop client-timesheet-app
cp /opt/app/data/timesheet.db.backup /opt/app/data/timesheet.db
docker start client-timesheet-app
```

### Scaling Considerations

The current architecture is designed for single-user or small team use. To scale beyond this:

1. **Database**: Migrate from SQLite to RDS (PostgreSQL/MySQL)
2. **Load Balancing**: Add Application Load Balancer with ACM certificate
3. **Auto Scaling**: Use Auto Scaling Group for multiple instances
4. **Container Orchestration**: Consider ECS Fargate for managed containers

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `docker/Dockerfile` | Multi-stage container build definition |
| `docker/overrides/server.js` | Production Express server configuration |
| `docker/overrides/database/init.js` | SQLite database initialization |
| `terraform/bootstrap/main.tf` | Foundational AWS resources |
| `terraform/bootstrap/variables.tf` | Bootstrap module variables |
| `terraform/bootstrap/outputs.tf` | Bootstrap module outputs |
| `terraform/infrastructure/main.tf` | Application infrastructure |
| `terraform/infrastructure/variables.tf` | Infrastructure module variables |
| `terraform/infrastructure/outputs.tf` | Infrastructure module outputs |
| `terraform/infrastructure/user_data.sh` | EC2 initialization script |
| `README.md` | Quick start and setup guide |
