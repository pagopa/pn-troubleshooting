#!/bin/bash
# This script lists all CloudWatch log groups that do NOT have the 'Microservice' tag
# and saves them into a CSV file for manual enrichment.
set -euo pipefail

# Check for required arguments
REGION=""
PROFILE=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -r|--region) REGION="$2"; shift ;;
        -p|--profile) PROFILE="$2"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

if [ -z "$REGION" ] || [ -z "$PROFILE" ]; then
    echo "Usage: $0 -r <aws-region> -p <aws-profile>"
    echo "Example: $0 -r eu-south-1 -p sso_pn-confinfo-prod-ro"
    exit 1
fi

AWS_PARAMS="--region $REGION --profile $PROFILE"

echo "Fetching AWS Account ID..."
ACCOUNT_ID=$(aws $AWS_PARAMS sts get-caller-identity --query 'Account' --output text)

OUTPUT_DIR="output_${ACCOUNT_ID}"
mkdir -p "$OUTPUT_DIR"

CSV_FILE="${OUTPUT_DIR}/${ACCOUNT_ID}.csv"

echo "Fetching all log groups in region ${REGION}..."
# Using --query to get log group names and handling potential pagination if necessary
# For simplicity, we assume describe-log-groups returns all or the user has relatively few.
# Larger environments might need --next-token.
log_groups=$(aws $AWS_PARAMS logs describe-log-groups --query 'logGroups[*].logGroupName' --output text)

echo "Checking log groups for missing 'Microservice' tag..."
echo "Log Group Name,Microservice Tag (Manual Input Required)" > "$CSV_FILE"

# Iterate through log groups and check tags
for lg in $log_groups; do
    # Fetch tags for the specific log group
    tags=$(aws $AWS_PARAMS logs list-tags-log-group --log-group-name "$lg" --query 'tags' --output json)
    
    # Check if 'Microservice' key exists in the tags JSON
    if ! echo "$tags" | grep -iq '"Microservice"'; then
        echo "Found missing tag for: $lg"
        echo "$lg," >> "$CSV_FILE"
    fi
done

echo "----------------------------------------------------------"
echo "Process completed."
echo "Output Directory: $OUTPUT_DIR"
echo "CSV File: $CSV_FILE"
echo "Format: Log Group Name,"
echo "Please fill the second column manually with the microservice name."
echo "----------------------------------------------------------"
