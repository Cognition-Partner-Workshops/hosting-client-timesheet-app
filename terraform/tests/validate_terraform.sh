#!/bin/bash

echo "=== Terraform Validation Tests ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(dirname "$SCRIPT_DIR")"

PASSED=0
FAILED=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -n "Testing: $test_name... "
    if eval "$test_command" > /dev/null 2>&1; then
        echo "PASSED"
        PASSED=$((PASSED + 1))
    else
        echo "FAILED"
        FAILED=$((FAILED + 1))
    fi
}

echo "=== Bootstrap Module Tests ==="
cd "$TERRAFORM_DIR/bootstrap"

run_test "Bootstrap: terraform fmt check" "terraform fmt -check -recursive"
run_test "Bootstrap: main.tf exists" "test -f main.tf"
run_test "Bootstrap: variables.tf exists" "test -f variables.tf"
run_test "Bootstrap: outputs.tf exists" "test -f outputs.tf"
run_test "Bootstrap: .terraform.lock.hcl exists" "test -f .terraform.lock.hcl"

echo ""
echo "=== Infrastructure Module Tests ==="
cd "$TERRAFORM_DIR/infrastructure"

run_test "Infrastructure: terraform fmt check" "terraform fmt -check -recursive"
run_test "Infrastructure: main.tf exists" "test -f main.tf"
run_test "Infrastructure: variables.tf exists" "test -f variables.tf"
run_test "Infrastructure: outputs.tf exists" "test -f outputs.tf"
run_test "Infrastructure: user_data.sh exists" "test -f user_data.sh"
run_test "Infrastructure: user_data.sh is executable or valid shell" "bash -n user_data.sh"

echo ""
echo "=== File Content Tests ==="

cd "$TERRAFORM_DIR/bootstrap"
run_test "Bootstrap: main.tf has terraform block" "grep -q 'terraform' main.tf"
run_test "Bootstrap: main.tf has required_providers" "grep -q 'required_providers' main.tf"
run_test "Bootstrap: variables.tf has variable declarations" "grep -q 'variable' variables.tf"
run_test "Bootstrap: outputs.tf has output declarations" "grep -q 'output' outputs.tf"

cd "$TERRAFORM_DIR/infrastructure"
run_test "Infrastructure: main.tf has terraform block" "grep -q 'terraform' main.tf"
run_test "Infrastructure: main.tf has aws provider" "grep -q 'aws' main.tf"
run_test "Infrastructure: variables.tf has variable declarations" "grep -q 'variable' variables.tf"
run_test "Infrastructure: outputs.tf has output declarations" "grep -q 'output' outputs.tf"

echo ""
echo "=== Summary ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
    echo "Some tests failed!"
    exit 1
else
    echo "All tests passed!"
    exit 0
fi
