#!/bin/bash

# =============================================================================
# Functional Test Suite for Client Timesheet App Terraform Infrastructure
# 
# This test suite validates the Terraform configuration including:
# - Terraform syntax and configuration validation
# - Variable validation
# - Resource configuration validation
# - Security group rules validation
# - IAM policy validation
# - Output validation
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Test result function
test_result() {
    local test_name="$1"
    local result="$2"
    local message="$3"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    
    if [ "$result" -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo -e "  ${YELLOW}Message${NC}: $message"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "Terraform Infrastructure Functional Tests"
echo "=============================================="
echo ""
echo "Testing directory: $TERRAFORM_DIR"
echo ""

# =============================================================================
# Test 1: Terraform Format Validation
# =============================================================================
echo "--- Terraform Format Tests ---"

cd "$TERRAFORM_DIR"

# Test terraform fmt
terraform fmt -check -recursive > /dev/null 2>&1
test_result "Terraform files are properly formatted" $? "Run 'terraform fmt -recursive' to fix formatting"

# =============================================================================
# Test 2: Terraform Syntax Validation
# =============================================================================
echo ""
echo "--- Terraform Syntax Tests ---"

# Initialize terraform (required for validation)
terraform init -backend=false > /dev/null 2>&1
test_result "Terraform initialization successful" $? "Check terraform configuration"

# Validate terraform configuration
terraform validate > /dev/null 2>&1
test_result "Terraform configuration is valid" $? "Check terraform syntax errors"

# =============================================================================
# Test 3: Required Variables Validation
# =============================================================================
echo ""
echo "--- Variable Definition Tests ---"

# Check that required variables are defined
grep -q 'variable "aws_region"' variables.tf
test_result "aws_region variable is defined" $? "Missing aws_region variable"

grep -q 'variable "environment"' variables.tf
test_result "environment variable is defined" $? "Missing environment variable"

grep -q 'variable "instance_type"' variables.tf
test_result "instance_type variable is defined" $? "Missing instance_type variable"

grep -q 'variable "ecr_repository_url"' variables.tf
test_result "ecr_repository_url variable is defined" $? "Missing ecr_repository_url variable"

grep -q 'variable "ecr_repository_arn"' variables.tf
test_result "ecr_repository_arn variable is defined" $? "Missing ecr_repository_arn variable"

grep -q 'variable "app_port"' variables.tf
test_result "app_port variable is defined" $? "Missing app_port variable"

# =============================================================================
# Test 4: Variable Default Values
# =============================================================================
echo ""
echo "--- Variable Default Value Tests ---"

# Check default values
grep -A5 'variable "aws_region"' variables.tf | grep -q 'default.*=.*"us-east-1"'
test_result "aws_region has correct default (us-east-1)" $? "aws_region default should be us-east-1"

grep -A5 'variable "environment"' variables.tf | grep -q 'default.*=.*"production"'
test_result "environment has correct default (production)" $? "environment default should be production"

grep -A5 'variable "instance_type"' variables.tf | grep -q 'default.*=.*"t3.micro"'
test_result "instance_type has correct default (t3.micro)" $? "instance_type default should be t3.micro"

grep -A5 'variable "app_port"' variables.tf | grep -q 'default.*=.*3001'
test_result "app_port has correct default (3001)" $? "app_port default should be 3001"

# =============================================================================
# Test 5: Security Group Configuration
# =============================================================================
echo ""
echo "--- Security Group Configuration Tests ---"

# Check security group resource exists
grep -q 'resource "aws_security_group" "app"' main.tf
test_result "Security group resource is defined" $? "Missing aws_security_group.app resource"

# Check HTTP ingress rule
grep -A20 'resource "aws_security_group" "app"' main.tf | grep -q 'from_port.*=.*80'
test_result "HTTP port 80 ingress rule exists" $? "Missing HTTP port 80 ingress rule"

# Check HTTPS ingress rule
grep -A30 'resource "aws_security_group" "app"' main.tf | grep -q 'from_port.*=.*443'
test_result "HTTPS port 443 ingress rule exists" $? "Missing HTTPS port 443 ingress rule"

# Check egress rule allows all outbound
grep -A50 'resource "aws_security_group" "app"' main.tf | grep -q 'protocol.*=.*"-1"'
test_result "Egress rule allows all outbound traffic" $? "Missing all-outbound egress rule"

# =============================================================================
# Test 6: IAM Role Configuration
# =============================================================================
echo ""
echo "--- IAM Role Configuration Tests ---"

# Check IAM role resource exists
grep -q 'resource "aws_iam_role" "ec2_role"' main.tf
test_result "IAM role resource is defined" $? "Missing aws_iam_role.ec2_role resource"

# Check IAM instance profile exists
grep -q 'resource "aws_iam_instance_profile" "ec2_profile"' main.tf
test_result "IAM instance profile is defined" $? "Missing aws_iam_instance_profile.ec2_profile resource"

# Check ECR policy exists
grep -q 'resource "aws_iam_role_policy" "ecr_policy"' main.tf
test_result "ECR IAM policy is defined" $? "Missing aws_iam_role_policy.ecr_policy resource"

# Check SSM policy attachment exists
grep -q 'resource "aws_iam_role_policy_attachment" "ssm_managed_instance"' main.tf
test_result "SSM policy attachment is defined" $? "Missing SSM policy attachment"

# =============================================================================
# Test 7: EC2 Instance Configuration
# =============================================================================
echo ""
echo "--- EC2 Instance Configuration Tests ---"

# Check EC2 instance resource exists
grep -q 'resource "aws_instance" "app"' main.tf
test_result "EC2 instance resource is defined" $? "Missing aws_instance.app resource"

# Check instance uses IAM profile
grep -A30 'resource "aws_instance" "app"' main.tf | grep -q 'iam_instance_profile'
test_result "EC2 instance has IAM profile attached" $? "Missing IAM profile on EC2 instance"

# Check root block device configuration
grep -A40 'resource "aws_instance" "app"' main.tf | grep -q 'root_block_device'
test_result "EC2 instance has root block device configured" $? "Missing root_block_device configuration"

# Check EBS encryption
grep -A50 'resource "aws_instance" "app"' main.tf | grep -q 'encrypted.*=.*true'
test_result "EBS volume encryption is enabled" $? "EBS encryption should be enabled"

# Check user_data is configured
grep -A40 'resource "aws_instance" "app"' main.tf | grep -q 'user_data'
test_result "EC2 instance has user_data configured" $? "Missing user_data configuration"

# =============================================================================
# Test 8: Elastic IP Configuration
# =============================================================================
echo ""
echo "--- Elastic IP Configuration Tests ---"

# Check EIP resource exists
grep -q 'resource "aws_eip" "app"' main.tf
test_result "Elastic IP resource is defined" $? "Missing aws_eip.app resource"

# Check EIP is associated with instance
grep -A5 'resource "aws_eip" "app"' main.tf | grep -q 'instance.*=.*aws_instance.app.id'
test_result "Elastic IP is associated with EC2 instance" $? "EIP should be associated with EC2 instance"

# =============================================================================
# Test 9: Output Definitions
# =============================================================================
echo ""
echo "--- Output Definition Tests ---"

# Check required outputs exist
grep -q 'output "instance_id"' outputs.tf
test_result "instance_id output is defined" $? "Missing instance_id output"

grep -q 'output "instance_public_ip"' outputs.tf
test_result "instance_public_ip output is defined" $? "Missing instance_public_ip output"

grep -q 'output "instance_public_dns"' outputs.tf
test_result "instance_public_dns output is defined" $? "Missing instance_public_dns output"

grep -q 'output "app_url"' outputs.tf
test_result "app_url output is defined" $? "Missing app_url output"

grep -q 'output "security_group_id"' outputs.tf
test_result "security_group_id output is defined" $? "Missing security_group_id output"

# =============================================================================
# Test 10: Backend Configuration
# =============================================================================
echo ""
echo "--- Backend Configuration Tests ---"

# Check S3 backend is configured
grep -q 'backend "s3"' main.tf
test_result "S3 backend is configured" $? "Missing S3 backend configuration"

# Check DynamoDB table for state locking
grep -A10 'backend "s3"' main.tf | grep -q 'dynamodb_table'
test_result "DynamoDB state locking is configured" $? "Missing DynamoDB state locking"

# Check encryption is enabled
grep -A10 'backend "s3"' main.tf | grep -q 'encrypt.*=.*true'
test_result "S3 backend encryption is enabled" $? "S3 backend encryption should be enabled"

# =============================================================================
# Test 11: Provider Configuration
# =============================================================================
echo ""
echo "--- Provider Configuration Tests ---"

# Check AWS provider is configured
grep -q 'provider "aws"' main.tf
test_result "AWS provider is configured" $? "Missing AWS provider configuration"

# Check required provider version
grep -q 'required_providers' main.tf
test_result "Required providers block exists" $? "Missing required_providers block"

# Check Terraform version constraint
grep -q 'required_version' main.tf
test_result "Terraform version constraint is defined" $? "Missing required_version constraint"

# =============================================================================
# Test 12: Resource Tagging
# =============================================================================
echo ""
echo "--- Resource Tagging Tests ---"

# Check EC2 instance has tags
grep -A60 'resource "aws_instance" "app"' main.tf | grep -q 'tags'
test_result "EC2 instance has tags configured" $? "Missing tags on EC2 instance"

# Check security group has tags
grep -A60 'resource "aws_security_group" "app"' main.tf | grep -q 'tags'
test_result "Security group has tags configured" $? "Missing tags on security group"

# Check EIP has tags
grep -A10 'resource "aws_eip" "app"' main.tf | grep -q 'tags'
test_result "Elastic IP has tags configured" $? "Missing tags on Elastic IP"

# =============================================================================
# Test 13: User Data Script
# =============================================================================
echo ""
echo "--- User Data Script Tests ---"

# Check user_data.sh exists
if [ -f "$TERRAFORM_DIR/user_data.sh" ]; then
    test_result "user_data.sh script exists" 0 ""
else
    test_result "user_data.sh script exists" 1 "Missing user_data.sh file"
fi

# Check user_data.sh is executable or has shebang
if [ -f "$TERRAFORM_DIR/user_data.sh" ]; then
    head -1 "$TERRAFORM_DIR/user_data.sh" | grep -q '^#!/'
    test_result "user_data.sh has shebang" $? "user_data.sh should have shebang"
fi

# =============================================================================
# Test Summary
# =============================================================================
echo ""
echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo -e "Total Tests: $TESTS_TOTAL"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review the failures above.${NC}"
    exit 1
fi
