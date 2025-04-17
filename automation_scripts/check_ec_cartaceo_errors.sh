#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
    cat <<EOF
Usage: $(basename "$0") -w <work-dir> [-t <visibility-timeout>] [--purge]
  -w, --work-dir           Working directory
  -t, --visibility-timeout Visibility timeout in seconds (default: 30)
  --purge                  Purge events from the SQS queue
EOF
    exit 1
}

# Default values
WORKDIR=""
STARTDIR=$(pwd)
OUTPUTDIR="$STARTDIR/output/check_ec_cartaceo_errors"
V_TIMEOUT=30
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
node dump_sqs.js --awsProfile sso_pn-confinfo-prod --queueName pn-ec-cartaceo-errori-queue-DLQ.fifo --visibilityTimeout "$V_TIMEOUT" 1>/dev/null

# Get the most recent dump file
ORIGINAL_DUMP=$(find "$WORKDIR/dump_sqs/result" -type f -exec ls -t1 {} + | head -1)
if [[ -z "$ORIGINAL_DUMP" ]]; then
  echo "No dump file found. Exiting."
  exit 1
fi
echo "Dump file: $ORIGINAL_DUMP"

#######################################################
# Step 2: Extract requestIdx values from the dump     #
#######################################################
if [[ ! -d "$WORKDIR/check_status_request" ]]; then
    echo "Script directory '$WORKDIR/check_status_request' does not exist. Exiting."
    exit 1
fi
cd "$WORKDIR/check_status_request" || { echo "Failed to cd into '$WORKDIR/check_status_request'"; exit 1; }
BASENAME=$(basename "${ORIGINAL_DUMP%.json}")
REQUEST_IDS_LIST="${BASENAME}_all_request_ids.txt"
jq -r '.[] | .Body | fromjson | .requestIdx' "$ORIGINAL_DUMP" > "$REQUEST_IDS_LIST"
echo "Extracted requestIdx values to: $(realpath "$REQUEST_IDS_LIST")"

#############################################################
# Step 3: Check request status on pn-EcRichiesteMetadati    #
#############################################################
node index.js --envName prod --fileName "$REQUEST_IDS_LIST" 1>/dev/null

# Assume that the node script produces an error.json file in this folder.
ERROR_JSON="error.json"
if [[ ! -f "$ERROR_JSON" ]]; then
  echo "error.json not found. Exiting."
  exit 1
fi

###########################################################
# Step 4: Convert the original dump to JSONLine format    #
###########################################################
JSONLINE_DUMP="${ORIGINAL_DUMP%.json}.jsonline"
jq -c '.[]' "$ORIGINAL_DUMP" > "$JSONLINE_DUMP"
JSONLINE_COUNT=$(wc -l < "$JSONLINE_DUMP")
if [[ $JSONLINE_COUNT -eq 0 ]]; then
  echo "No events found in JSONLine dump. Exiting."
  exit 1
fi
echo "Converted dump to JSONLine file: $(realpath "$JSONLINE_DUMP")"
echo "Total events in JSONLine dump: $JSONLINE_COUNT"

###################################################
# Step 5: Extract requests in error status        #
###################################################
ERROR_REQUEST_IDS_LIST="${ORIGINAL_DUMP%.json}_error_request_ids.txt"
jq -r '.requestId | sub("pn-cons-000~"; "")' "$ERROR_JSON" > "$ERROR_REQUEST_IDS_LIST"
echo "Extracted error requestIds to: $(realpath "$ERROR_REQUEST_IDS_LIST")"
echo "Total requestIds in error status (not to remove): $(wc -l < "$ERROR_REQUEST_IDS_LIST")"

#######################################################
# Step 6: Filter out events from requests in error    #
#######################################################
FILTERED_DUMP="${ORIGINAL_DUMP%.json}_filtered.jsonline"
grep -x -F -v -f "$ERROR_REQUEST_IDS_LIST" "$JSONLINE_DUMP" > "$FILTERED_DUMP"
FILTERED_COUNT=$(wc -l < "$FILTERED_DUMP")
echo "Filtered dump stored in: $(realpath "$FILTERED_DUMP")"
echo "Total events in filtered dump (to remove): $FILTERED_COUNT"

# Compare counts and warn if JSONLine dump count is greater than filtered dump count
if [[ $JSONLINE_COUNT -gt $FILTERED_COUNT ]]; then
    echo "WARNING: Total events count is greater than the count of events to remove."
    echo "Please analyze the requestIds in error status for discrepancies."
    echo "See: $(realpath "$ERROR_REQUEST_IDS_LIST")"
fi

#######################################################
# Step 7: Copy all generated files to OUTPUTDIR       #
#######################################################
cp "$ORIGINAL_DUMP" "$OUTPUTDIR/"
cp "$(realpath "$REQUEST_IDS_LIST")" "$OUTPUTDIR/"
cp "$(realpath "$ERROR_REQUEST_IDS_LIST")" "$OUTPUTDIR/"
cp "$JSONLINE_DUMP" "$OUTPUTDIR/"
cp "$FILTERED_DUMP" "$OUTPUTDIR/"
echo "Files copied to $OUTPUTDIR."

#######################################################
# Step 8 (optional): Remove events from SQS queue     #
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
    node index.js --account confinfo --envName prod --queueName pn-ec-cartaceo-errori-queue-DLQ.fifo --visibilityTimeout "$V_TIMEOUT" --fileName "$FILTERED_DUMP" 1>/dev/null
fi

echo "Process completed."