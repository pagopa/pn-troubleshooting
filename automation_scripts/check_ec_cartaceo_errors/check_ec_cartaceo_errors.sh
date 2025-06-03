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
OUTPUTDIR="$STARTDIR/output"
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
node dump_sqs.js --awsProfile "$AWS_PROFILE" --queueName pn-ec-cartaceo-errori-queue-DLQ.fifo --visibilityTimeout "$V_TIMEOUT" 1>/dev/null

# Get the most recent dump file
ORIGINAL_DUMP=$(find "$WORKDIR/dump_sqs/result" -type f -name "dump_pn-ec-cartaceo-errori-queue-DLQ.fifo*" -newermt "@$SCRIPT_START_TIME" -exec ls -t1 {} + | head -1)
if [[ -z "$ORIGINAL_DUMP" ]]; then
  echo "No dump file found. Exiting."
  exit 1
fi
ORIGINAL_DUMP=$(realpath "$ORIGINAL_DUMP")
GENERATED_FILES+=("$ORIGINAL_DUMP")
echo "Dump file: $ORIGINAL_DUMP"

#######################################################
# Step 2: Extract requestIdx values from the dump     #
#######################################################
if [[ ! -d "$WORKDIR/check_status_request" ]]; then
    echo "Script directory '$WORKDIR/check_status_request' does not exist. Exiting."
    cleanup
    exit 1
fi
cd "$WORKDIR/check_status_request" || { echo "Failed to cd into '$WORKDIR/check_status_request'"; exit 1; }
# Remove pre-existing JSON files if they are present
for file in counter.json error.json fromconsolidatore.json toconsolidatore.json locked.json notfound.json; do
    if [[ -f "$file" ]]; then
        rm "$file"
        echo "Removed existing file: $file"
    fi
done

BASENAME=$(basename "${ORIGINAL_DUMP%.json}")
RESULTSDIR="$WORKDIR/check_status_request"
REQUEST_IDS_LIST="$WORKDIR/check_status_request/${BASENAME}_all_request_ids.txt"
jq -r '.[] | .Body | fromjson | .requestIdx' "$ORIGINAL_DUMP" > "$REQUEST_IDS_LIST"
REQUEST_IDS_LIST=$(realpath "$REQUEST_IDS_LIST")
GENERATED_FILES+=("$REQUEST_IDS_LIST")
echo "Extracted requestIdx values to: $REQUEST_IDS_LIST"

#############################################################
# Step 3: Check request status on pn-EcRichiesteMetadati    #
#############################################################
node index.js --envName "$ENV_NAME" --fileName "$REQUEST_IDS_LIST" 1>/dev/null
cp "$WORKDIR/check_status_request/counter.json" "$WORKDIR/check_status_request/${BASENAME}_counter.json"
GENERATED_FILES+=("$WORKDIR/check_status_request/${BASENAME}_counter.json")

###########################################################
# Step 4: Convert the original dump to JSONLine format    #
###########################################################
JSONLINE_DUMP="$WORKDIR/check_status_request/${BASENAME}.jsonl"
jq -c '.[]' "$ORIGINAL_DUMP" > "$JSONLINE_DUMP"
JSONLINE_DUMP=$(realpath "$JSONLINE_DUMP")
GENERATED_FILES+=("$JSONLINE_DUMP")
JSONLINE_COUNT=$(wc -l < "$JSONLINE_DUMP")
if [[ $JSONLINE_COUNT -eq 0 ]]; then
  echo "No events found in JSONLine dump. Exiting."
  cleanup
  exit 1
fi
echo "Converted dump to JSONLine file: $JSONLINE_DUMP"
echo "Total events in JSONLine dump: $JSONLINE_COUNT"

###################################################
# Step 5: Extract requests in error status        #
###################################################
ERROR_JSON="$WORKDIR/check_status_request/error.json"
ERROR_REQUEST_IDS_LIST="$WORKDIR/check_status_request/${BASENAME}_error_request_ids.txt"

if [[ -f "$ERROR_JSON" ]]; then
    ERROR_JSON=$(realpath "$ERROR_JSON")
    jq -r '.requestId | sub("pn-cons-000~"; "")' "$ERROR_JSON" > "$ERROR_REQUEST_IDS_LIST"
    ERROR_REQUEST_IDS_LIST=$(realpath "$ERROR_REQUEST_IDS_LIST")
    GENERATED_FILES+=("$ERROR_REQUEST_IDS_LIST")
    ERROR_COUNT=$(wc -l < "$ERROR_REQUEST_IDS_LIST")
    echo "Extracted error requestIds to: $ERROR_REQUEST_IDS_LIST"
    echo "Total requestIds in error status (not to remove): $ERROR_COUNT"
else
    : > "$ERROR_REQUEST_IDS_LIST"
    ERROR_REQUEST_IDS_LIST=$(realpath "$ERROR_REQUEST_IDS_LIST")
    GENERATED_FILES+=("$ERROR_REQUEST_IDS_LIST")
    echo "No error.json found. All events can be removed."
    echo "Total requestIds in error status (not to remove): 0"
fi

#######################################################
# Step 6: Filter out events from requests in error    #
#######################################################
FILTERED_DUMP="$WORKDIR/check_status_request/${BASENAME}_filtered.jsonl"
if [[ -s "$ERROR_REQUEST_IDS_LIST" ]]; then
    grep -F -v -f "$ERROR_REQUEST_IDS_LIST" "$JSONLINE_DUMP" > "$FILTERED_DUMP"
else
    cp "$JSONLINE_DUMP" "$FILTERED_DUMP"
fi
FILTERED_DUMP=$(realpath "$FILTERED_DUMP")
GENERATED_FILES+=("$FILTERED_DUMP")
FILTERED_COUNT=$(wc -l < "$FILTERED_DUMP")
echo "Filtered dump stored in: $FILTERED_DUMP"
echo "Total events in filtered dump (to remove): $FILTERED_COUNT"

#######################################################
# Step 7 (optional): Remove events from SQS queue     #
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
    node index.js --account confinfo --envName "$ENV_NAME" --queueName pn-ec-cartaceo-errori-queue-DLQ.fifo --visibilityTimeout "$V_TIMEOUT" --fileName "$FILTERED_DUMP" 1>/dev/null
    find "$RESULTSDIR" -type f -name "dump_pn-ec-cartaceo-errori-queue-DLQ.fifo*.jsonl_result.json" | xargs rm
    echo "Events purged from the SQS queue."
fi

#######################################################
# Step 8: Move all generated files to OUTPUTDIR       #
#######################################################
for f in "${GENERATED_FILES[@]}"; do
    [[ -f "$f" ]] && mv "$f" "$OUTPUTDIR/"
done
echo "Files moved to $OUTPUTDIR."

echo "Process completed."