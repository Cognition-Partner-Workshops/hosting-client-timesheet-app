# Terraform to CloudFormation Conversion Playbook

This playbook documents the process for converting Terraform Infrastructure as Code (IaC) to AWS CloudFormation templates.

## Overview

This guide provides a systematic approach to converting Terraform configurations to CloudFormation, including common patterns, validation steps, and troubleshooting tips.

## Prerequisites

Before starting the conversion, ensure you have the following tools installed and configured.

**Required Tools:**
- AWS CLI (for template validation)
- cfn-lint (for linting and best practice checks)
- Python 3.x (for cfn-lint installation)

**Installation:**
```bash
pip install cfn-lint
```

## Conversion Process

### Step 1: Analyze Terraform Configuration

Begin by reviewing the existing Terraform files to understand the resources being created.

**Key files to examine:**
- `main.tf` - Primary resource definitions
- `variables.tf` - Input variables and defaults
- `outputs.tf` - Output values
- `*.tf` - Any additional resource files

**Document the following:**
- All AWS resources being created
- Dependencies between resources
- Variables and their default values
- Outputs that need to be exported

### Step 2: Create CloudFormation Template Structure

CloudFormation templates follow a specific structure. Start with this skeleton:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: >
  Brief description of what this template creates

Parameters:
  # Input parameters (equivalent to Terraform variables)

Resources:
  # AWS resources (equivalent to Terraform resources)

Outputs:
  # Output values (equivalent to Terraform outputs)
```

### Step 3: Convert Resources

Use the mapping table below to convert Terraform resources to CloudFormation.

**Common Resource Mappings:**

| Terraform Resource | CloudFormation Resource |
|-------------------|------------------------|
| `aws_iam_role` | `AWS::IAM::Role` |
| `aws_iam_policy` | `AWS::IAM::Policy` |
| `aws_iam_role_policy` | `AWS::IAM::Policy` (with Roles property) |
| `aws_iam_role_policy_attachment` | `ManagedPolicyArns` in Role |
| `aws_iam_instance_profile` | `AWS::IAM::InstanceProfile` |
| `aws_iam_openid_connect_provider` | `AWS::IAM::OIDCProvider` |
| `aws_ec2_instance` | `AWS::EC2::Instance` |
| `aws_security_group` | `AWS::EC2::SecurityGroup` |
| `aws_eip` | `AWS::EC2::EIP` |
| `aws_ecr_repository` | `AWS::ECR::Repository` |
| `aws_s3_bucket` | `AWS::S3::Bucket` |
| `aws_dynamodb_table` | `AWS::DynamoDB::Table` |

### Step 4: Convert Variables to Parameters

Terraform variables become CloudFormation Parameters.

**Terraform:**
```hcl
variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}
```

**CloudFormation:**
```yaml
Parameters:
  InstanceType:
    Type: String
    Default: t3.micro
    Description: EC2 instance type
    AllowedValues:
      - t3.micro
      - t3.small
      - t3.medium
```

### Step 5: Convert Outputs

Terraform outputs become CloudFormation Outputs with optional exports for cross-stack references.

**Terraform:**
```hcl
output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}
```

**CloudFormation:**
```yaml
Outputs:
  InstanceId:
    Description: EC2 instance ID
    Value: !Ref AppInstance
    Export:
      Name: !Sub '${AWS::StackName}-InstanceId'
```

### Step 6: Handle Data Sources

Terraform data sources need special handling in CloudFormation.

**Common patterns:**

| Terraform Data Source | CloudFormation Equivalent |
|----------------------|--------------------------|
| `data.aws_caller_identity.current` | `!Ref AWS::AccountId` |
| `data.aws_region.current` | `!Ref AWS::Region` |
| `data.aws_ami` | SSM Parameter Store lookup |
| `data.aws_availability_zones` | `!GetAZs ''` |

**AMI Lookup Example:**
```yaml
Parameters:
  LatestAmiId:
    Type: AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>
    Default: /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64
```

### Step 7: Convert Intrinsic Functions

**Function Mappings:**

| Terraform | CloudFormation |
|-----------|---------------|
| `var.name` | `!Ref ParameterName` |
| `resource.attribute` | `!Ref ResourceName` or `!GetAtt ResourceName.Attribute` |
| `"${var.x}-suffix"` | `!Sub '${ParameterName}-suffix'` |
| `jsonencode({...})` | Inline YAML or `Fn::ToJsonString` |
| `base64encode(...)` | `Fn::Base64` |
| `templatefile(...)` | `!Sub` with inline content |
| `merge(map1, map2)` | Manual merge in YAML |
| `lookup(map, key)` | `!FindInMap` with Mappings section |

### Step 8: Validate Templates

Always validate templates before deployment.

**Syntax Validation:**
```bash
cfn-lint cloudformation/template.yaml
```

**AWS CLI Validation (requires AWS credentials):**
```bash
aws cloudformation validate-template --template-body file://template.yaml
```

## Common Issues and Solutions

### Issue 1: VpcId Required for Security Group Egress

**Error:**
```
E3021 'VpcId' is a dependency of 'SecurityGroupEgress'
```

**Solution:**
Add VpcId parameter and reference it in the security group:
```yaml
Parameters:
  VpcId:
    Type: AWS::EC2::VPC::Id
    Description: VPC ID where resources will be created

Resources:
  SecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      VpcId: !Ref VpcId
      # ... rest of properties
```

### Issue 2: IAM Resource Names Must Be Unique

CloudFormation will fail if IAM resources with the same name already exist. Consider:
- Using `!Sub '${AWS::StackName}-ResourceName'` for unique names
- Or accepting that stacks cannot coexist with Terraform-created resources

### Issue 3: User Data Variable Substitution

When using `!Sub` in UserData, CloudFormation variables use `${Variable}` syntax which conflicts with shell variables.

**Solution:** Use `${!ShellVar}` to escape shell variables or use heredoc with literal strings:
```yaml
UserData:
  Fn::Base64: !Sub |
    #!/bin/bash
    AWS_REGION="${AWS::Region}"  # CloudFormation substitution
    SHELL_VAR="literal"          # Not substituted
```

### Issue 4: Circular Dependencies

CloudFormation detects circular dependencies at deployment time.

**Solution:** Use `DependsOn` attribute sparingly and restructure resources to break cycles.

## Key Differences from Terraform

| Aspect | Terraform | CloudFormation |
|--------|-----------|----------------|
| State Management | S3 + DynamoDB (manual setup) | AWS-managed (automatic) |
| Drift Detection | `terraform plan` | Stack drift detection in console |
| Rollback | Manual | Automatic on failure |
| Multi-cloud | Yes | AWS only |
| Language | HCL | YAML/JSON |
| Modules | Terraform Registry | Nested stacks, StackSets |
| Secrets | External (Vault, etc.) | SSM Parameter Store, Secrets Manager |

## Validation Checklist

Before deploying, verify the following:

- [ ] All resources from Terraform are represented in CloudFormation
- [ ] All variables have corresponding Parameters with appropriate types
- [ ] All outputs are defined with correct references
- [ ] cfn-lint passes with no errors
- [ ] IAM policies have equivalent permissions
- [ ] Tags are preserved on all resources
- [ ] User data scripts have correct variable substitution
- [ ] Cross-stack references use Exports where needed

## Testing Procedure

1. **Lint the templates:**
   ```bash
   cfn-lint cloudformation/*.yaml
   ```

2. **Deploy to test environment:**
   ```bash
   aws cloudformation create-stack \
     --stack-name test-stack \
     --template-body file://template.yaml \
     --capabilities CAPABILITY_NAMED_IAM
   ```

3. **Verify resources:**
   - Check AWS Console for created resources
   - Verify IAM policies and roles
   - Test application functionality

4. **Clean up:**
   ```bash
   aws cloudformation delete-stack --stack-name test-stack
   ```

## References

- [AWS CloudFormation User Guide](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/)
- [CloudFormation Resource Types Reference](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-template-resource-type-ref.html)
- [cfn-lint Documentation](https://github.com/aws-cloudformation/cfn-lint)
- [Terraform to CloudFormation Migration Guide](https://aws.amazon.com/blogs/devops/)
