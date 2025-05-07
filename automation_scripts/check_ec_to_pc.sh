#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
    cat <<EOF
Usage: $(basename "$0") -w <work-dir> [-t <visibility-timeout>] [--purge]
  -w, --work-dir           Working directory
  -t, --visibility-timeout Visibility timeout in seconds (default: 180)
  --purge                  Purge events from the SQS queue
EOF
    exit 1
}

# Default values
WORKDIR=""
STARTDIR=$(pwd)
OUTPUTDIR="$STARTDIR/output/check_ec_to_pc"
V_TIMEOUT=180
PURGE=false

# Parse parameters
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -w|--work-dir)
            WORKDIR="$2"
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

mkdir -p "$OUTPUTDIR"

echo "Working directory: $(realpath "$WORKDIR")"
echo "Starting directory: $STARTDIR"
echo "Output directory: $(realpath "$OUTPUTDIR")"
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
node dump_sqs.js --awsProfile sso_pn-core-prod --queueName pn-external_channel_to_paper_channel-DLQ --visibilityTimeout "$V_TIMEOUT" 1>/dev/null

# Get the most recent dump file
ORIGINAL_DUMP=$(find "$WORKDIR/dump_sqs/result" -type f -name "dump_pn-external_channel_to_paper_channel-DLQ*" -exec ls -t1 {} + | head -1)
if [[ -z "$ORIGINAL_DUMP" ]]; then
  echo "No dump file found. Exiting."
  exit 1
fi
ORIGINAL_DUMP=$(realpath "$ORIGINAL_DUMP")
echo "Dump file: $ORIGINAL_DUMP"

#######################################################
# Step 2: Extract requestId values from the dump     #
#######################################################
if [[ ! -d "$WORKDIR/check_feedback_from_requestId_simplified" ]]; then
    echo "Script directory '$WORKDIR/check_feedback_from_requestId_simplified' does not exist. Exiting."
    exit 1
fi
cd "$WORKDIR/check_feedback_from_requestId_simplified" || { echo "Failed to cd into '$WORKDIR/check_feedback_from_requestId_simplified'"; exit 1; }

BASENAME=$(basename "${ORIGINAL_DUMP%.json}")
RESULTSDIR="$WORKDIR/check_feedback_from_requestId_simplified/results"
REQUEST_IDS_LIST="$WORKDIR/check_feedback_from_requestId_simplified/${BASENAME}_all_request_ids.txt"
jq -r '.[] | .Body | fromjson | .analogMail.requestId' "$ORIGINAL_DUMP" | sort -u > "$REQUEST_IDS_LIST"
REQUEST_IDS_LIST=$(realpath "$REQUEST_IDS_LIST")
echo "Extracted requestId values to: $REQUEST_IDS_LIST"

#############################################################
# Step 3: Check if there is a feedback for each requestId   #
#############################################################
node index.js --envName prod --fileName "$REQUEST_IDS_LIST" 1>/dev/null

CHECK_FEEDBACK_RESULTS=$(find "$WORKDIR/check_feedback_from_requestId_simplified/results" -maxdepth 1 -type d -name "prod_*" | sort | tail -n 1)
if [[ ! -d "$CHECK_FEEDBACK_RESULTS" ]]; then
  echo "No feedback check results found. Exiting."
  exit 1
fi
CHECK_FEEDBACK_RESULTS=$(realpath "$CHECK_FEEDBACK_RESULTS")

FOUND_JSON="${CHECK_FEEDBACK_RESULTS}/found.json"
FOUND_JSON=$(realpath "$FOUND_JSON")
echo "Total requestIds that received a feedback (to remove): $(wc -l < "$FOUND_JSON")"
NOT_FOUND="${CHECK_FEEDBACK_RESULTS}/not_found.txt"
NOT_FOUND=$(realpath "$NOT_FOUND")
echo "Total requestIds that didn't receive a feedback (not to remove): $(wc -l < "$NOT_FOUND")"

###########################################################
# Step 4: Convert the original dump to JSONLine format    #
###########################################################
JSONLINE_DUMP="$WORKDIR/check_feedback_from_requestId_simplified/${BASENAME}.jsonline"
jq -c '.[]' "$ORIGINAL_DUMP" > "$JSONLINE_DUMP"
JSONLINE_DUMP=$(realpath "$JSONLINE_DUMP")
JSONLINE_COUNT=$(wc -l < "$JSONLINE_DUMP")
if [[ $JSONLINE_COUNT -eq 0 ]]; then
  echo "No events found in JSONLine dump. Exiting."
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
    node index.js --account core --envName prod --queueName pn-external_channel_to_paper_channel-DLQ --visibilityTimeout "$V_TIMEOUT" --fileName "$FILTERED_DUMP" 1>/dev/null
    find "$RESULTSDIR" -type f -name "dump_pn-external_channel_to_paper_channel-DLQ*.jsonline_result.json" | xargs rm
    echo "Events purged from the SQS queue."
fi

#######################################################
# Step 7: Move all generated files to OUTPUTDIR       #
#######################################################
mv "$ORIGINAL_DUMP" "$OUTPUTDIR/"
mv "$REQUEST_IDS_LIST" "$OUTPUTDIR/"
mv "$NOT_FOUND" "$OUTPUTDIR/${BASENAME}_not_found.txt"
mv "$JSONLINE_DUMP" "$OUTPUTDIR/"
mv "$FILTERED_DUMP" "$OUTPUTDIR/"
echo "Files copied to $OUTPUTDIR."

echo "Process completed."