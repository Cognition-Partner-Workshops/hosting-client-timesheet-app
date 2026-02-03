import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Configuration
const config = new pulumi.Config();
const awsRegion = config.get("awsRegion") || "us-east-1";
const allowDestroy = config.getBoolean("allowDestroy") ?? true;
const githubOrg = config.get("githubOrg") || "Cognition-Partner-Workshops";
const githubRepo = config.get("githubRepo") || "hosting-client-timesheet-app";

// Get current AWS account ID
const currentIdentity = aws.getCallerIdentity({});
const accountId = currentIdentity.then(identity => identity.accountId);

// Common tags
const tags = {
    Environment: "shared",
    Project: "client-timesheet-app",
    ManagedBy: "pulumi-bootstrap",
};

// =============================================================================
// Terraform State Backend Resources (for reference/migration)
// =============================================================================

// S3 bucket for Terraform state
const terraformStateBucket = new aws.s3.Bucket("terraform-state-bucket", {
    bucket: pulumi.interpolate`client-timesheet-terraform-state-${accountId}`,
    forceDestroy: allowDestroy,
    tags: {
        ...tags,
        Name: "Terraform State Bucket",
    },
});

// S3 bucket versioning
const terraformStateBucketVersioning = new aws.s3.BucketVersioningV2("terraform-state-versioning", {
    bucket: terraformStateBucket.id,
    versioningConfiguration: {
        status: "Enabled",
    },
});

// S3 bucket server-side encryption
const terraformStateBucketEncryption = new aws.s3.BucketServerSideEncryptionConfigurationV2("terraform-state-encryption", {
    bucket: terraformStateBucket.id,
    rules: [{
        applyServerSideEncryptionByDefault: {
            sseAlgorithm: "AES256",
        },
    }],
});

// S3 bucket public access block
const terraformStateBucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock("terraform-state-public-access-block", {
    bucket: terraformStateBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
});

// DynamoDB table for Terraform state locking
const terraformLocksTable = new aws.dynamodb.Table("terraform-locks-table", {
    name: "client-timesheet-terraform-locks",
    billingMode: "PAY_PER_REQUEST",
    hashKey: "LockID",
    attributes: [{
        name: "LockID",
        type: "S",
    }],
    tags: {
        ...tags,
        Name: "Terraform Lock Table",
    },
});

// =============================================================================
// ECR Repository
// =============================================================================

const ecrRepository = new aws.ecr.Repository("app-ecr-repository", {
    name: "client-timesheet-app",
    imageTagMutability: "MUTABLE",
    forceDelete: allowDestroy,
    imageScanningConfiguration: {
        scanOnPush: true,
    },
    tags: {
        ...tags,
        Name: "Client Timesheet App ECR",
    },
});

// ECR lifecycle policy - keep last 10 images
const ecrLifecyclePolicy = new aws.ecr.LifecyclePolicy("app-ecr-lifecycle-policy", {
    repository: ecrRepository.name,
    policy: JSON.stringify({
        rules: [{
            rulePriority: 1,
            description: "Keep last 10 images",
            selection: {
                tagStatus: "any",
                countType: "imageCountMoreThan",
                countNumber: 10,
            },
            action: {
                type: "expire",
            },
        }],
    }),
});

// =============================================================================
// GitHub Actions OIDC Provider and Deployment Role (Least Privilege)
// =============================================================================

// OIDC Provider for GitHub Actions
const githubActionsOidcProvider = new aws.iam.OpenIdConnectProvider("github-actions-oidc-provider", {
    url: "https://token.actions.githubusercontent.com",
    clientIdLists: ["sts.amazonaws.com"],
    thumbprintLists: ["6938fd4d98bab03faadb97b34396831e3780aea1"],
    tags: {
        ...tags,
        Name: "GitHub Actions OIDC Provider",
    },
});

// IAM Role for GitHub Actions CD Pipeline (Least Privilege)
const githubActionsDeployRole = new aws.iam.Role("github-actions-deploy-role", {
    name: "client-timesheet-github-actions-deploy",
    assumeRolePolicy: pulumi.all([githubActionsOidcProvider.arn]).apply(([oidcArn]) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: {
                Federated: oidcArn,
            },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
                StringEquals: {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                },
                StringLike: {
                    "token.actions.githubusercontent.com:sub": `repo:${githubOrg}/${githubRepo}:*`,
                },
            },
        }],
    })),
    tags: {
        ...tags,
        Name: "GitHub Actions Deploy Role",
    },
});

// ECR Push/Pull Policy (scoped to specific repository)
const githubActionsEcrPolicy = new aws.iam.RolePolicy("github-actions-ecr-policy", {
    name: "ecr-push-pull",
    role: githubActionsDeployRole.id,
    policy: pulumi.all([ecrRepository.arn]).apply(([ecrArn]) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Sid: "ECRGetAuthToken",
                Effect: "Allow",
                Action: ["ecr:GetAuthorizationToken"],
                Resource: "*",
            },
            {
                Sid: "ECRPushPull",
                Effect: "Allow",
                Action: [
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                    "ecr:PutImage",
                    "ecr:InitiateLayerUpload",
                    "ecr:UploadLayerPart",
                    "ecr:CompleteLayerUpload",
                ],
                Resource: ecrArn,
            },
        ],
    })),
});

// EC2 Describe Policy (for getting instance ID by tag)
const githubActionsEc2Policy = new aws.iam.RolePolicy("github-actions-ec2-policy", {
    name: "ec2-describe",
    role: githubActionsDeployRole.id,
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Sid: "EC2DescribeInstances",
                Effect: "Allow",
                Action: ["ec2:DescribeInstances"],
                Resource: "*",
                Condition: {
                    StringEquals: {
                        "ec2:ResourceTag/Project": "client-timesheet-app",
                    },
                },
            },
            {
                Sid: "EC2DescribeAll",
                Effect: "Allow",
                Action: ["ec2:DescribeInstances"],
                Resource: "*",
            },
        ],
    }),
});

// SSM Send Command Policy (for deployment via Systems Manager)
const githubActionsSsmPolicy = new aws.iam.RolePolicy("github-actions-ssm-policy", {
    name: "ssm-send-command",
    role: githubActionsDeployRole.id,
    policy: pulumi.all([accountId]).apply(([accId]) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [
            {
                Sid: "SSMSendCommand",
                Effect: "Allow",
                Action: ["ssm:SendCommand"],
                Resource: [
                    `arn:aws:ssm:${awsRegion}::document/AWS-RunShellScript`,
                    `arn:aws:ec2:${awsRegion}:${accId}:instance/*`,
                ],
                Condition: {
                    StringEquals: {
                        "ssm:resourceTag/Project": "client-timesheet-app",
                    },
                },
            },
            {
                Sid: "SSMGetCommandInvocation",
                Effect: "Allow",
                Action: ["ssm:GetCommandInvocation"],
                Resource: "*",
            },
        ],
    })),
});

// =============================================================================
// Outputs
// =============================================================================

export const terraformStateBucketName = terraformStateBucket.bucket;
export const terraformLockTableName = terraformLocksTable.name;
export const ecrRepositoryUrl = ecrRepository.repositoryUrl;
export const ecrRepositoryName = ecrRepository.name;
export const ecrRepositoryArn = ecrRepository.arn;
export const awsAccountId = accountId;
export const githubActionsRoleArn = githubActionsDeployRole.arn;
export const githubActionsOidcProviderArn = githubActionsOidcProvider.arn;
