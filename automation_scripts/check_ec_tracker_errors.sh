#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
    cat <<EOF
Usage: $(basename "$0") -w <work-dir> -c <channel-type|all> [-t <visibility-timeout>] [--purge]
  -w, --work-dir           Working directory
  -c, --channel-type       Channel type to process. Supported values:
                           pec, email, cartaceo, sms, all
  -t, --visibility-timeout Visibility timeout in seconds (default: 30)
  --purge                  Purge events from the SQS queue
EOF
    exit 1
}

# Default values
WORKDIR=""
CHANNEL_TYPE=""
STARTDIR=$(pwd)
OUTPUTDIR_BASE="$STARTDIR/output/check_ec_tracker_errors"
V_TIMEOUT=30
PURGE=false

# Supported channel types
SUPPORTED_CHANNELS=("pec" "email" "cartaceo" "sms")

# Declare summary associative arrays
declare -A C_totalEvents
declare -A C_removableEvents
declare -A C_unremovableEvents

# Parse parameters
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -w|--work-dir)
            WORKDIR="$2"
            shift 2
            ;;
        -c|--channel-type)
            CHANNEL_TYPE="$2"
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

if [[ -z "$WORKDIR" || -z "$CHANNEL_TYPE" ]]; then
    usage
fi

# Function to process a single channel type
process_channel(){
    local CHANNEL="$1"
    local TARGET_QUEUE="pn-ec-tracker-${CHANNEL}-errori-queue-DLQ.fifo"
    local OUTPUTDIR="$OUTPUTDIR_BASE/$CHANNEL"
    mkdir -p "$OUTPUTDIR"

    echo "----------------------------------------------"
    echo "Processing Channel: $CHANNEL"
    echo "Queue: $TARGET_QUEUE"
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
    node dump_sqs.js --awsProfile sso_pn-confinfo-prod --queueName "$TARGET_QUEUE" --visibilityTimeout "$V_TIMEOUT" 1>/dev/null

    # Get the most recent dump file
    ORIGINAL_DUMP=$(find "$WORKDIR/dump_sqs/result" -type f -name "dump_${TARGET_QUEUE}*" -exec ls -t1 {} + | head -1)
    if [[ -z "$ORIGINAL_DUMP" ]]; then
      echo "No dump file found for $TARGET_QUEUE. Skipping channel."
      C_totalEvents["$CHANNEL"]=0
      C_removableEvents["$CHANNEL"]=0
      C_unremovableEvents["$CHANNEL"]=0
      return 0
    fi

    echo "Dump file: $(realpath "$ORIGINAL_DUMP")"

    TOTAL_EVENTS=$(jq -c '.[]' "$ORIGINAL_DUMP" | wc -l)
    echo "Total events in SQS dump: $TOTAL_EVENTS"
    C_totalEvents["$CHANNEL"]="$TOTAL_EVENTS"
    if [[ $TOTAL_EVENTS -eq 0 ]]; then
        C_removableEvents["$CHANNEL"]=0
        C_unremovableEvents["$CHANNEL"]=0
        echo "No events found in the dump file. Skipping channel."
        return 0
    fi

    #######################################################
    # Step 2: Analyze events in the DLQ dump              #
    #######################################################
    ANALYSIS_SCRIPT_DIR="$WORKDIR/false_negative_ec_tracker"
    if [[ ! -d "$ANALYSIS_SCRIPT_DIR" ]]; then
        echo "Script directory '$ANALYSIS_SCRIPT_DIR' does not exist. Exiting."
        exit 1
    fi
    cd "$ANALYSIS_SCRIPT_DIR" || { echo "Failed to cd into '$ANALYSIS_SCRIPT_DIR'"; exit 1; }
    RESULTSDIR="$ANALYSIS_SCRIPT_DIR/results"
    node index.js --envName prod --fileName "$ORIGINAL_DUMP" --channelType "$CHANNEL"

    # Get the most recent removable events file
    SAFE_TO_DELETE=$(find "$RESULTSDIR" -type f -name "to_remove_${CHANNEL}*" -exec ls -t1 {} + | head -1)
    if [[ -z "$SAFE_TO_DELETE" ]]; then
      echo "No removable events found for $CHANNEL. Skipping channel."
      C_removableEvents["$CHANNEL"]=0
      C_unremovableEvents["$CHANNEL"]=0
      return 0
    fi
    REMOVABLE_EVENTS=$(wc -l < "$SAFE_TO_DELETE")
    echo "Total removable events: $REMOVABLE_EVENTS"
    C_removableEvents["$CHANNEL"]="$REMOVABLE_EVENTS"

    # Sum lines from problem_found, to_keep, error files for unremovable events
    UNREMOVABLE_EVENTS=0
    for f in problem_found_${CHANNEL}* to_keep_${CHANNEL}* error_${CHANNEL}*; do
        FILEPATH=$(find "$RESULTSDIR" -type f -name "$f" -exec ls -t1 {} + | head -1 || true)
        if [[ -n "$FILEPATH" && -f "$FILEPATH" ]]; then
            COUNT=$(wc -l < "$FILEPATH")
            UNREMOVABLE_EVENTS=$((UNREMOVABLE_EVENTS + COUNT))
            echo "Unremovable events file: $(realpath "$FILEPATH") ($COUNT events)"
        fi
    done
    echo "Total unremovable events: $UNREMOVABLE_EVENTS"
    C_unremovableEvents["$CHANNEL"]="$UNREMOVABLE_EVENTS"

    #######################################################
    # Step 3 (optional): Remove events from SQS queue     #
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
        node index.js --account confinfo --envName prod --queueName "$TARGET_QUEUE" --visibilityTimeout "$V_TIMEOUT" --fileName "$SAFE_TO_DELETE" 1>/dev/null
        echo "Events purged from the SQS queue."
    fi

    #######################################################
    # Step 4: Move all generated files to OUTPUTDIR       #
    #######################################################
    mv "$ORIGINAL_DUMP" "$OUTPUTDIR/"
    mv "$SAFE_TO_DELETE" "$OUTPUTDIR/"
    echo "Files moved to $OUTPUTDIR."

    echo "Process for channel $CHANNEL completed."
}

# Main execution
if [[ "$CHANNEL_TYPE" == "all" ]]; then
    for c in "${SUPPORTED_CHANNELS[@]}"; do
        process_channel "$c"
    done
else
    # Validate channel type
    found=false
    for c in "${SUPPORTED_CHANNELS[@]}"; do
        if [[ "$CHANNEL_TYPE" == "$c" ]]; then
            found=true
            break
        fi
    done
    if ! $found; then
        echo "Unsupported channel type: $CHANNEL_TYPE"
        usage
    fi
    process_channel "$CHANNEL_TYPE"
fi

# Summary: Print totals for each processed channel.
echo "---------- Summary ----------"
for channel in "${!C_totalEvents[@]}"; do
    echo "Channel: $channel"
    echo "  Total events: ${C_totalEvents[$channel]}"
    echo "  Total removable events: ${C_removableEvents[$channel]}"
    echo "  Total unremovable events: ${C_unremovableEvents[$channel]}"
done