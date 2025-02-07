#!/bin/bash

# Base paths
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
WORK_DIR="$SCRIPT_DIR/delete_attachment_future_action"
TEMP_DIR="$WORK_DIR/temp"
RESULT_DIR="$WORK_DIR/result"

# File paths
FILTERED_MESSAGES_FILE="$TEMP_DIR/check_attachment_retention.json"
RESULT_FILE="$RESULT_DIR/to-remove.json"
PURGE_RESULT_FILE="${RESULT_FILE}_result.json"
FINAL_PURGE_RESULT_FILE="$RESULT_DIR/to-remove-purge-result.json"

# Queue configuration
DLQ_NAME="pn-delivery_push_actions-DLQ"
VISIBILITY_TIMEOUT="30"

function show_usage() {
    echo "Usage: $0 --envName|-e <environment> --dumpFile|-f <path> [--purge|-p]"
    echo ""
    echo "Parameters:"
    echo "    --envName, -e     Required. Environment to check (dev|test|uat|hotfix|prod)"
    echo "    --dumpFile, -f    Required. Path to the SQS dump file"
    echo "    --purge, -p       Optional. Purge processed messages from DLQ"
    echo "    --help, -h        Display this help message"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--envName)
            ENV_NAME="$2"
            shift 2
            ;;
        -f|--dumpFile)
            DUMP_FILE="$2"
            shift 2
            ;;
        -p|--purge)
            PURGE=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown parameter: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$ENV_NAME" ] || [ -z "$DUMP_FILE" ]; then
    echo "Error: Missing required parameters"
    show_usage
    exit 1
fi

# Validate environment
VALID_ENVIRONMENTS=("dev" "test" "uat" "hotfix" "prod")
if [[ ! " ${VALID_ENVIRONMENTS[@]} " =~ " ${ENV_NAME} " ]]; then
    echo "Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS[*]}"
    exit 1
fi

# Validate dump file exists
if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: Dump file not found: $DUMP_FILE"
    exit 1
fi

# Create work directories
mkdir -p "$TEMP_DIR"
mkdir -p "$RESULT_DIR"

# Filter CHECK_ATTACHMENT_RETENTION messages
jq -c '.[] | select(((.Body | fromjson).type == "CHECK_ATTACHMENT_RETENTION"))' "$DUMP_FILE" > "$FILTERED_MESSAGES_FILE"

# Check if any matching messages were found
if [ ! -s "$FILTERED_MESSAGES_FILE" ]; then
    echo "No CHECK_ATTACHMENT_RETENTION messages found in input file"
    exit 0
fi

# Call NodeJS script with parameters
node "../delete-attachment-future-action/delete-attachment-future-action.js" \
    --envName "$ENV_NAME" \
    --dumpFile "$FILTERED_MESSAGES_FILE" \
    --resultPath "$RESULT_FILE"

# Check if purge is requested
if [ "$PURGE" = true ]; then
    # Check if result file exists and has content
    if [ ! -f "$RESULT_FILE" ] || [ ! -s "$RESULT_FILE" ]; then
        echo "No messages need to be purged from DLQ"
        exit 0
    fi
    # Purge processed messages from DLQ
    echo "Purging processed messages from DLQ..."
    node "../remove_from_sqs/index.js" \
        --account "core" \
        --envName "$ENV_NAME" \
        --queueName "$DLQ_NAME" \
        --visibilityTimeout "$VISIBILITY_TIMEOUT" \
        --fileName "$RESULT_FILE"

    # Rename purge result file
    if [ -f "$PURGE_RESULT_FILE" ]; then
        mv "$PURGE_RESULT_FILE" "$FINAL_PURGE_RESULT_FILE"
    fi
fi