#!/bin/bash
# This script performs backfill of 'Microservice' tags to CloudWatch Log Groups
# based on a manually enriched CSV file.
set -euo pipefail

# Function to display usage
usage() {
    echo "Usage: $0 -r <aws-region> -p <aws-profile> -f <csv-file> [--dry-run]"
    echo "Example: $0 -r eu-south-1 -p sso_pn-confinfo-prod-ro -f output_1234567890/1234567890.csv"
    echo "Example with Dry Run: $0 -r eu-south-1 -p sso_pn-confinfo-prod-ro -f output_1234567890/1234567890.csv --dry-run"
    exit 1
}

# Parse arguments
REGION=""
PROFILE=""
CSV_FILE=""
DRY_RUN=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        -r|--region) REGION="$2"; shift ;;
        -p|--profile) PROFILE="$2"; shift ;;
        -f|--file) CSV_FILE="$2"; shift ;;
        --dry-run) DRY_RUN=true ;;
        *) echo "Unknown parameter passed: $1"; usage ;;
    esac
    shift
done

# Check for required arguments
if [ -z "$REGION" ] || [ -z "$PROFILE" ] || [ -z "$CSV_FILE" ]; then
    usage
fi

AWS_PARAMS="--region $REGION --profile $PROFILE"

# Check if file exists
if [ ! -f "$CSV_FILE" ]; then
    echo "Error: File $CSV_FILE not found."
    exit 1
fi

# Check for dry-run flag
if [[ "${4:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    echo "################################################"
    echo "              DRY RUN MODE ENABLED             "
    echo "      No changes will be applied to AWS        "
    echo "################################################"
fi

echo "Processing file: $CSV_FILE"
echo "------------------------------------------------"

# Skip header and read CSV line by line
# Format: LogGroupName,MicroserviceValue
tail -n +2 "$CSV_FILE" | while IFS=',' read -r log_group microservice || [ -n "$log_group" ]; do
    # Remove carriage returns or spaces if any
    log_group=$(echo "$log_group" | xargs)
    microservice=$(echo "$microservice" | xargs)

    if [ -z "$log_group" ] || [ -z "$microservice" ]; then
        echo "Skipping log group '$log_group': no Microservice tag provided in CSV."
        continue
    fi

    echo "Tagging: $log_group with Microservice=$microservice"

    if [ "$DRY_RUN" = true ]; then
        echo "[DRY-RUN] Command: aws $AWS_PARAMS logs tag-log-group --log-group-name \"$log_group\" --tags \"Microservice=$microservice\""
    else
        # Apply the tag
        if aws $AWS_PARAMS logs tag-log-group --log-group-name "$log_group" --tags "Microservice=$microservice"; then
            echo "Successfully tagged $log_group"
        else
            echo "Failed to tag $log_group"
        fi
    fi
done

echo "------------------------------------------------"
echo "Backfill process completed."
