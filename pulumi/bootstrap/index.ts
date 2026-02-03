import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Configuration
const config = new pulumi.Config();
const awsConfig = new pulumi.Config("aws");
const awsRegion = awsConfig.require("region");
const allowDestroy = config.getBoolean("allowDestroy") ?? true;
const githubOrg = config.get("githubOrg") ?? "Cognition-Partner-Workshops";
const githubRepo = config.get("githubRepo") ?? "hosting-client-timesheet-app";

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
// Terraform State Backend Resources (for migration compatibility)
// =============================================================================

const terraformStateBucket = new aws.s3.Bucket("terraformStateBucket", {
    bucket: pulumi.interpolate`client-timesheet-terraform-state-${accountId}`,
    forceDestroy: allowDestroy,
    tags: {
        ...tags,
        Name: "Terraform State Bucket",
    },
});

const terraformStateBucketVersioning = new aws.s3.BucketVersioningV2("terraformStateBucketVersioning", {
    bucket: terraformStateBucket.id,
    versioningConfiguration: {
        status: "Enabled",
    },
});

const terraformStateBucketEncryption = new aws.s3.BucketServerSideEncryptionConfigurationV2("terraformStateBucketEncryption", {
    bucket: terraformStateBucket.id,
    rules: [{
        applyServerSideEncryptionByDefault: {
            sseAlgorithm: "AES256",
        },
    }],
});

const terraformStateBucketPublicAccessBlock = new aws.s3.BucketPublicAccessBlock("terraformStateBucketPublicAccessBlock", {
    bucket: terraformStateBucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
});

const terraformLockTable = new aws.dynamodb.Table("terraformLockTable", {
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
// GitHub Actions OIDC Provider and Deployment Role (Least Privilege)
// =============================================================================

const githubActionsOidcProvider = new aws.iam.OpenIdConnectProvider("githubActionsOidcProvider", {
    url: "https://token.actions.githubusercontent.com",
    clientIdLists: ["sts.amazonaws.com"],
    thumbprintLists: ["6938fd4d98bab03faadb97b34396831e3780aea1"],
    tags: {
        ...tags,
        Name: "GitHub Actions OIDC Provider",
    },
});

// IAM Role for GitHub Actions CD Pipeline (Least Privilege)
const githubActionsDeployRole = new aws.iam.Role("githubActionsDeployRole", {
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

// =============================================================================
// ECR Repository
// =============================================================================

const ecrRepository = new aws.ecr.Repository("ecrRepository", {
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

const ecrLifecyclePolicy = new aws.ecr.LifecyclePolicy("ecrLifecyclePolicy", {
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
// IAM Policies for GitHub Actions Role
// =============================================================================

// ECR Push/Pull Policy (scoped to specific repository)
const githubActionsEcrPolicy = new aws.iam.RolePolicy("githubActionsEcrPolicy", {
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
const githubActionsEc2Policy = new aws.iam.RolePolicy("githubActionsEc2Policy", {
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
const githubActionsSsmPolicy = new aws.iam.RolePolicy("githubActionsSsmPolicy", {
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
export const terraformLockTableName = terraformLockTable.name;
export const ecrRepositoryUrl = ecrRepository.repositoryUrl;
export const ecrRepositoryName = ecrRepository.name;
export const ecrRepositoryArn = ecrRepository.arn;
export const awsAccountId = accountId;
export const githubActionsRoleArn = githubActionsDeployRole.arn;
export const githubActionsOidcProviderArn = githubActionsOidcProvider.arn;
