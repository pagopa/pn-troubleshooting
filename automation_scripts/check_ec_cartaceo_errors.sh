#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
    cat <<EOF
Usage: $(basename "$0") -w <work-dir>
  -w, --work-dir           Working directory
EOF
    exit 1
}

# Parse parameters
WORKDIR=""
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -w|--work-dir)
            WORKDIR="$2"
            shift 2
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

echo "Working directory: $WORKDIR"

#############################################
# Step 1: Dump messages from the SQS queue  #
#############################################

echo "Dumping SQS queue..."
cd "$WORKDIR/dump_sqs"
node dump_sqs.js --awsProfile sso_pn-confinfo-prod --queueName pn-ec-cartaceo-errori-queue-DLQ.fifo > /dev/null

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
cd "$WORKDIR/check_status_request"
REQUEST_IDS_LIST="./${ORIGINAL_DUMP%.json}_all_request_ids.txt"
cat "$ORIGINAL_DUMP" | jq -r '.[] | .Body | fromjson | .requestIdx' > "$REQUEST_IDS_LIST"
echo "Extracted requestIdx values to: $WORKDIR/check_status_request/$REQUEST_IDS_LIST"

#############################################################
# Step 3: Check request status on pn-EcRichiesteMetadati    #
#############################################################
node index.js --envName prod --fileName "$REQUEST_IDS_LIST" > /dev/null

# Assume that the node script produces an error.json file in this folder.
ERROR_JSON="error.json"
if [[ ! -f "$ERROR_JSON" ]]; then
  echo "error.json not found. Exiting."
  exit 1
fi

###################################################
# Step 4: Extract requests in error status        #
###################################################
ERROR_REQUEST_IDS_LIST="./${ORIGINAL_DUMP%.json}_error_request_ids.txt"
cat "$ERROR_JSON" | jq -r '.requestId | sub("pn-cons-000~"; "")' > "$ERROR_REQUEST_IDS_LIST"
echo "Extracted error requestIds to: $WORKDIR/check_status_request/$ERROR_REQUEST_IDS_LIST"

###########################################################
# Step 5: Convert the original dump to JSONLine format    #
###########################################################
JSONLINE_DUMP="${ORIGINAL_DUMP%.json}.jsonline"
jq -c '.[]' "$ORIGINAL_DUMP" > "$JSONLINE_DUMP"
echo "Converted dump to JSONLine file: $JSONLINE_DUMP"

#######################################################
# Step 6: Filter out events from requests in error    #
#######################################################
FILTERED_DUMP="${ORIGINAL_DUMP%.json}_filtered.jsonline"
grep -F -v -f "$ERROR_REQUEST_IDS_LIST" "$JSONLINE_DUMP" > "$FILTERED_DUMP"
echo "Filtered dump stored in: $FILTERED_DUMP"

echo "Process completed."