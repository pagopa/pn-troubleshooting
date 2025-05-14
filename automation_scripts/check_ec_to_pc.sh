#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_START_TIME=$(date +%s)

usage() {
    cat <<EOF
Usage: $(basename "$0") -w <work-dir> [-e <env>] [-t <visibility-timeout>] [--purge]
  -w, --work-dir           Working directory
  -e, --env                Environment (prod, test, uat, hotfix). Default: prod
  -t, --visibility-timeout Visibility timeout in seconds (default: 300)
  --purge                  Purge events from the SQS queue
EOF
    exit 1
}

# Default values
WORKDIR=""
STARTDIR=$(pwd)
OUTPUTDIR="$STARTDIR/output/check_ec_to_pc"
V_TIMEOUT=300
PURGE=false
ENV="prod"

GENERATED_FILES=()
CHECK_FEEDBACK_RESULTS=""

cleanup() {
    for f in "${GENERATED_FILES[@]}"; do
        [[ -f "$f" ]] && rm -f "$f"
    done
    [[ -n "$CHECK_FEEDBACK_RESULTS" && -d "$CHECK_FEEDBACK_RESULTS" ]] && rm -rf "$CHECK_FEEDBACK_RESULTS"
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
        AWS_PROFILE="sso_pn-core-prod"
        ENV_NAME="prod"
        ;;
    test)
        AWS_PROFILE="sso_pn-core-test"
        ENV_NAME="test"
        ;;
    uat)
        AWS_PROFILE="sso_pn-core-uat"
        ENV_NAME="uat"
        ;;
    hotfix)
        AWS_PROFILE="sso_pn-core-hotfix"
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
node dump_sqs.js --awsProfile "$AWS_PROFILE" --queueName pn-external_channel_to_paper_channel-DLQ --visibilityTimeout "$V_TIMEOUT" 1>/dev/null

# Get the most recent dump file
ORIGINAL_DUMP=$(find "$WORKDIR/dump_sqs/result" -type f -name "dump_pn-external_channel_to_paper_channel-DLQ*" -newermt "@$SCRIPT_START_TIME" -exec ls -t1 {} + | head -1)
if [[ -z "$ORIGINAL_DUMP" ]]; then
  echo "No dump file found. Exiting."
  exit 1
fi
ORIGINAL_DUMP=$(realpath "$ORIGINAL_DUMP")
GENERATED_FILES+=("$ORIGINAL_DUMP")
echo "Dump file: $ORIGINAL_DUMP"

#######################################################
# Step 2: Extract requestId values from the dump     #
#######################################################
if [[ ! -d "$WORKDIR/check_feedback_from_requestId_simplified" ]]; then
    echo "Script directory '$WORKDIR/check_feedback_from_requestId_simplified' does not exist. Exiting."
    cleanup
    exit 1
fi
cd "$WORKDIR/check_feedback_from_requestId_simplified" || { echo "Failed to cd into '$WORKDIR/check_feedback_from_requestId_simplified'"; exit 1; }

BASENAME=$(basename "${ORIGINAL_DUMP%.json}")
RESULTSDIR="$WORKDIR/check_feedback_from_requestId_simplified/results"
REQUEST_IDS_LIST="$WORKDIR/check_feedback_from_requestId_simplified/${BASENAME}_all_request_ids.txt"
jq -r '.[] | .Body | fromjson | .analogMail.requestId' "$ORIGINAL_DUMP" | sort -u > "$REQUEST_IDS_LIST"
REQUEST_IDS_LIST=$(realpath "$REQUEST_IDS_LIST")
GENERATED_FILES+=("$REQUEST_IDS_LIST")
echo "Extracted requestId values to: $REQUEST_IDS_LIST"

#############################################################
# Step 3: Check if there is a feedback for each requestId   #
#############################################################
node index.js --envName "$ENV_NAME" --fileName "$REQUEST_IDS_LIST" 1>/dev/null

CHECK_FEEDBACK_RESULTS=$(find "$WORKDIR/check_feedback_from_requestId_simplified/results" -maxdepth 1 -type d -name "prod_*" -newermt "@$SCRIPT_START_TIME" | sort | tail -n 1)
if [[ ! -d "$CHECK_FEEDBACK_RESULTS" ]]; then
  echo "No feedback check results found. Exiting."
  cleanup
  exit 1
fi
CHECK_FEEDBACK_RESULTS=$(realpath "$CHECK_FEEDBACK_RESULTS")

NOT_FOUND="${CHECK_FEEDBACK_RESULTS}/not_found.txt"
FOUND_JSON="${CHECK_FEEDBACK_RESULTS}/found.json"

if [[ ! -f "$NOT_FOUND" ]]; then
  echo "WARNING: All requestIds received a feedback (not_found.txt not produced)."
else
  NOT_FOUND=$(realpath "$NOT_FOUND")
  GENERATED_FILES+=("$NOT_FOUND")
  echo "Total requestIds that didn't receive a feedback (not to remove): $(wc -l < "$NOT_FOUND")"
fi

if [[ ! -f "$FOUND_JSON" ]]; then
  echo "WARNING: No requestIds received a feedback (found.json not produced). Cleaning up and exiting."
  cleanup
  exit 0
fi
FOUND_JSON=$(realpath "$FOUND_JSON")
GENERATED_FILES+=("$FOUND_JSON")
echo "Total requestIds that received a feedback (to remove): $(wc -l < "$FOUND_JSON")"

###########################################################
# Step 4: Convert the original dump to JSONLine format    #
###########################################################
JSONLINE_DUMP="$WORKDIR/check_feedback_from_requestId_simplified/${BASENAME}.jsonline"
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

#######################################################
# Step 5: Filter out events from requests in error    #
#######################################################
FILTERED_DUMP="$WORKDIR/check_feedback_from_requestId_simplified/${BASENAME}_filtered.jsonline"
grep -F -v -f "$NOT_FOUND" "$JSONLINE_DUMP" > "$FILTERED_DUMP"
FILTERED_DUMP=$(realpath "$FILTERED_DUMP")
GENERATED_FILES+=("$FILTERED_DUMP")
FILTERED_COUNT=$(wc -l < "$FILTERED_DUMP")
echo "Filtered dump stored in: $FILTERED_DUMP"
echo "Total events in filtered dump (to remove): $FILTERED_COUNT"

#######################################################
# Step 6 (optional): Remove events from SQS queue     #
#######################################################
if $PURGE; then
    echo "Purge option enabled. Proceeding to remove events from the SQS queue..."
    if [[ ! -d "$WORKDIR/remove_from_sqs" ]]; then
        echo "Script directory '$WORKDIR/remove_from_sqs' does not exist. Exiting."
        exit 1
    fi
    cd "$WORKDIR/remove_from_sqs" || { echo "Failed to cd into '$WORKDIR/remove_from_sqs'"; exit 1; }
    echo "Waiting for the visibility timeout ($V_TIMEOUT seconds) to expire..."
    sleep "$V_TIMEOUT"
    echo "Purging events from the SQS queue..."
    node index.js --account core --envName "$ENV_NAME" --queueName pn-external_channel_to_paper_channel-DLQ --visibilityTimeout "$V_TIMEOUT" --fileName "$FILTERED_DUMP" 1>/dev/null
    find "$RESULTSDIR" -type f -name "dump_pn-external_channel_to_paper_channel-DLQ*.jsonline_result.json" | xargs rm
    echo "Events purged from the SQS queue."
fi

#######################################################
# Step 7: Move all generated files to OUTPUTDIR       #
#######################################################
for f in "${GENERATED_FILES[@]}"; do
    [[ -f "$f" ]] && mv "$f" "$OUTPUTDIR/"
done
[[ -n "$CHECK_FEEDBACK_RESULTS" && -d "$CHECK_FEEDBACK_RESULTS" ]] && rm -rf "$CHECK_FEEDBACK_RESULTS"
echo "Files copied to $OUTPUTDIR."

echo "Process completed."