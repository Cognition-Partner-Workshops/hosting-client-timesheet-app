#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { BootstrapStack } from '../lib/bootstrap-stack';
import { InfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();

// Get configuration from context or environment
const awsRegion = app.node.tryGetContext('awsRegion') ?? process.env.AWS_REGION ?? 'us-east-1';
const githubOrg = app.node.tryGetContext('githubOrg') ?? 'Cognition-Partner-Workshops';
const githubRepo = app.node.tryGetContext('githubRepo') ?? 'hosting-client-timesheet-app';
const allowDestroy = app.node.tryGetContext('allowDestroy') ?? true;
const environment = app.node.tryGetContext('environment') ?? 'production';
const instanceType = app.node.tryGetContext('instanceType') ?? 't3.micro';
const appPort = app.node.tryGetContext('appPort') ?? 3001;

// ECR repository URL and ARN - required for infrastructure stack
// These should be provided after bootstrap stack is deployed
const ecrRepositoryUrl = app.node.tryGetContext('ecrRepositoryUrl');
const ecrRepositoryArn = app.node.tryGetContext('ecrRepositoryArn');

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: awsRegion,
};

// Bootstrap Stack - One-time foundational setup
// Creates: S3 bucket, DynamoDB table, ECR repository, GitHub OIDC provider, IAM roles
const bootstrapStack = new BootstrapStack(app, 'ClientTimesheetBootstrapStack', {
  env,
  githubOrg,
  githubRepo,
  allowDestroy,
  description: 'Bootstrap resources for Client Timesheet App (S3, DynamoDB, ECR, OIDC)',
});

// Infrastructure Stack - Application-specific resources
// Creates: EC2 instance, Security Group, Elastic IP, IAM instance profile
// Note: This stack requires ECR repository URL and ARN from bootstrap stack outputs
if (ecrRepositoryUrl && ecrRepositoryArn) {
  new InfrastructureStack(app, 'ClientTimesheetInfrastructureStack', {
    env,
    environment,
    instanceType,
    ecrRepositoryUrl,
    ecrRepositoryArn,
    appPort,
    description: 'Infrastructure for Client Timesheet App (EC2, Security Groups, EIP)',
  });
}

app.synth();
