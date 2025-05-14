#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_START_TIME=$(date +%s)

usage() {
    cat <<EOF
Usage: $(basename "$0") -w <work-dir> [-e <env>] [-t <visibility-timeout>] [--purge]
  -w, --work-dir           Working directory
  -e, --env                Environment (prod, test, uat, hotfix). Default: prod
  -t, --visibility-timeout Visibility timeout in seconds (default: 30)
  --purge                  Purge events from the SQS queue
EOF
    exit 1
}

# Default values
WORKDIR=""
STARTDIR=$(pwd)
OUTPUTDIR="$STARTDIR/output/check_ec_availability_manager"
V_TIMEOUT=30
PURGE=false
ENV="prod"

GENERATED_FILES=()

cleanup() {
    for f in "${GENERATED_FILES[@]}"; do
        [[ -f "$f" ]] && rm -f "$f"
    done
}

# Parse parameters
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -w|--work-dir)
            WORKDIR="$2"
            shift 2
            ;;
        -e|--env)
            ENV="$2"
            shift 2
            ;;
        -t|--visibility-timeout)
            V_TIMEOUT="$2"
            shift 2
            ;;
        --purge)
            PURGE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown parameter passed: $1"
            usage
            ;;
    esac
done

if [[ -z "$WORKDIR" ]]; then
    usage
fi

# Validate ENV
case "$ENV" in
    prod|test|uat|hotfix) ;;
    *)
        echo "Unsupported environment: $ENV"
        usage
        ;;
esac

# Set AWS profile and envName
case "$ENV" in
    prod)
        AWS_PROFILE="sso_pn-confinfo-prod"
        ENV_NAME="prod"
        ;;
    test)
        AWS_PROFILE="sso_pn-confinfo-test"
        ENV_NAME="test"
        ;;
    uat)
        AWS_PROFILE="sso_pn-confinfo-uat"
        ENV_NAME="uat"
        ;;
    hotfix)
        AWS_PROFILE="sso_pn-confinfo-hotfix"
        ENV_NAME="hotfix"
        ;;
esac

mkdir -p "$OUTPUTDIR"

echo "Working directory: $(realpath "$WORKDIR")"
echo "Starting directory: $STARTDIR"
echo "Output directory: $(realpath "$OUTPUTDIR")"
echo "Environment: $ENV"
echo "Visibility Timeout: $V_TIMEOUT seconds"

#############################################
# Step 1: Dump events from the SQS queue    #
#############################################

echo "Dumping SQS queue..."
if [[ ! -d "$WORKDIR/dump_sqs" ]]; then
    echo "Script directory '$WORKDIR/dump_sqs' does not exist. Exiting."
    exit 1
fi
cd "$WORKDIR/dump_sqs" || { echo "Failed to cd into '$WORKDIR/dump_sqs'"; exit 1; }
node dump_sqs.js --awsProfile "$AWS_PROFILE" --queueName pn-ec-availabilitymanager-queue-DLQ --visibilityTimeout "$V_TIMEOUT" 1>/dev/null

# Get the most recent dump file
ORIGINAL_DUMP=$(find "$WORKDIR/dump_sqs/result" -type f -name 'dump_pn-ec-availabilitymanager-queue-DLQ*' -exec ls -t1 {} + | head -1)
if [[ -z "$ORIGINAL_DUMP" ]]; then
  echo "No dump file found. Exiting."
  exit 1
fi
ORIGINAL_DUMP=$(realpath "$ORIGINAL_DUMP")
GENERATED_FILES+=("$ORIGINAL_DUMP")
echo "Dump file: $ORIGINAL_DUMP"

TOTAL_EVENTS=$(jq -c '.[]' "$ORIGINAL_DUMP" | wc -l)
if [[ $TOTAL_EVENTS -eq 0 ]]; then
  echo "No events found in the dump file. Exiting."
  cleanup
  exit 1
fi
echo "Total events in SQS dump: $TOTAL_EVENTS"

#######################################################
# Step 2: Check if the request has a 'sent' event     #
#######################################################
if [[ ! -d "$WORKDIR/check-sent-paper-attachment" ]]; then
    echo "Script directory '$WORKDIR/check-sent-paper-attachment' does not exist. Exiting."
    cleanup
    exit 1
fi
cd "$WORKDIR/check-sent-paper-attachment" || { echo "Failed to cd into '$WORKDIR/check-sent-paper-attachment'"; exit 1; }
RESULTSDIR="$WORKDIR/check-sent-paper-attachment/results"
node index.js --envName "$ENV_NAME" --dumpFile "$ORIGINAL_DUMP" --queueName pn-ec-availabilitymanager-queue-DLQ

# Get the most recent analysis output file
SAFE_TO_DELETE=$(find "$RESULTSDIR" -type f -name 'safe_to_delete_pn-ec-availabilitymanager-queue-DLQ*' -newermt "@$SCRIPT_START_TIME" -exec ls -t1 {} + | head -1)
if [[ -z "$SAFE_TO_DELETE" ]]; then
  echo "No removable events found. Exiting."
  cleanup
  exit 1
fi
GENERATED_FILES+=("$SAFE_TO_DELETE")
REMOVABLE_EVENTS=$(wc -l < "$SAFE_TO_DELETE")
echo "Total removable events: $REMOVABLE_EVENTS"
UNSAFE_TO_DELETE=$(find "$RESULTSDIR" -type f -name "need_further_analysis_pn-ec-availabilitymanager-queue-DLQ*" -newermt "@$SCRIPT_START_TIME" -exec ls -t1 {} + | head -1)
if [[ "$UNSAFE_TO_DELETE" != "" ]]; then
  echo "Unremovable events found. Please check the file: $(realpath "$UNSAFE_TO_DELETE")"
  GENERATED_FILES+=("$UNSAFE_TO_DELETE")
  UNREMOVABLE_EVENTS=$(wc -l < "$UNSAFE_TO_DELETE")
  echo "Total unremovable events: $UNREMOVABLE_EVENTS"
else
  echo "No unremovable events found."
fi

#######################################################
# Step 3 (optional): Remove events from SQS queue     #
#######################################################
if $PURGE; then
    echo "Purge option enabled. Proceeding to remove events from the SQS queue..."
    if [[ ! -d "$WORKDIR/remove_from_sqs" ]]; then
        echo "Script directory '$WORKDIR/remove_from_sqs' does not exist. Exiting."
        cleanup
        exit 1
    fi
    cd "$WORKDIR/remove_from_sqs" || { echo "Failed to cd into '$WORKDIR/remove_from_sqs'"; exit 1; }
    echo "Waiting for the visibility timeout ($V_TIMEOUT seconds) to expire..."
    sleep "$V_TIMEOUT"
    echo "Purging events from the SQS queue..."
    node index.js --account confinfo --envName "$ENV_NAME" --queueName pn-ec-availabilitymanager-queue-DLQ --visibilityTimeout "$V_TIMEOUT" --fileName "$SAFE_TO_DELETE" 1>/dev/null
    find "$RESULTSDIR" -type f -name "safe_to_delete_pn-ec-availabilitymanager-queue-DLQ*.json_result.json" | xargs rm
    echo "Events purged from the SQS queue."
fi

#######################################################
# Step 4: Move all generated files to OUTPUTDIR       #
#######################################################
for f in "${GENERATED_FILES[@]}"; do
    [[ -f "$f" ]] && mv "$f" "$OUTPUTDIR/"
done
echo "Files moved to $OUTPUTDIR."

echo "Process completed."