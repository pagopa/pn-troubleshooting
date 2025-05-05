#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
    cat <<EOF
Usage: $(basename "$0") -w <work-dir> -q <dlq-queue|all> [-t <visibility-timeout>] [--purge]
  -w, --work-dir           Working directory
  -q, --queue              Target DLQ queue name or "all". Supported values:
                           pn-ss-transformation-raster-queue-DLQ,
                           pn-safestore_to_deliverypush-DLQ,
                           pn-ss-staging-bucket-events-queue-DLQ,
                           pn-ss-transformation-sign-and-timemark-queue-DLQ,
                           pn-ss-main-bucket-events-queue-DLQ,
                           all
  -t, --visibility-timeout Visibility timeout in seconds (default: 30)
  --purge                  Purge events from the SQS queue
EOF
    exit 1
}

# Default values
WORKDIR=""
QUEUE=""
STARTDIR=$(pwd)
OUTPUTDIR_BASE="$STARTDIR/output/check_safestorage_dlq"
V_TIMEOUT=30
PURGE=false

# Declare summary associative arrays
declare -A Q_totalEvents
declare -A Q_removableEvents
declare -A Q_unremovableEvents

# Parse parameters
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -w|--work-dir)
            WORKDIR="$2"
            shift 2
            ;;
        -q|--queue)
            QUEUE="$2"
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

if [[ -z "$WORKDIR" || -z "$QUEUE" ]]; then
    usage
fi

# Define supported queues array.
SUPPORTED_QUEUES=("pn-ss-transformation-raster-queue-DLQ" "pn-safestore_to_deliverypush-DLQ" "pn-ss-staging-bucket-events-queue-DLQ" "pn-ss-transformation-sign-and-timemark-queue-DLQ" "pn-ss-main-bucket-events-queue-DLQ")

# Function to process a single queue.
process_queue(){
    local TARGET_QUEUE="$1"
    local OUTPUTDIR="$OUTPUTDIR_BASE/$TARGET_QUEUE"
    mkdir -p "$OUTPUTDIR"

    echo "----------------------------------------------"
    echo "Processing Queue: $TARGET_QUEUE"
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
    
    if [[ "$TARGET_QUEUE" == "pn-safestore_to_deliverypush-DLQ" ]]; then
        node dump_sqs.js --awsProfile sso_pn-core-prod --queueName pn-safestore_to_deliverypush-DLQ --visibilityTimeout "$V_TIMEOUT" 1>/dev/null
    else
        node dump_sqs.js --awsProfile sso_pn-confinfo-prod --queueName "$TARGET_QUEUE" --visibilityTimeout "$V_TIMEOUT" 1>/dev/null
    fi

    # Get the most recent dump file
    ORIGINAL_DUMP=$(find "$WORKDIR/dump_sqs/result" -type f -name "dump_$TARGET_QUEUE*" -exec ls -t1 {} + | head -1)
    if [[ -z "$ORIGINAL_DUMP" ]]; then
      echo "No dump file found for $TARGET_QUEUE. Skipping queue."
      Q_totalEvents["$TARGET_QUEUE"]=0
      Q_removableEvents["$TARGET_QUEUE"]=0
      Q_unremovableEvents["$TARGET_QUEUE"]=0
      return 0
    fi
    
    echo "Dump file: $(realpath "$ORIGINAL_DUMP")"

    TOTAL_EVENTS=$(jq -c '.[]' "$ORIGINAL_DUMP" | wc -l)
    echo "Total events in SQS dump: $TOTAL_EVENTS"
    Q_totalEvents["$TARGET_QUEUE"]="$TOTAL_EVENTS"
    if [[ $TOTAL_EVENTS -eq 0 ]]; then
        Q_removableEvents["$TARGET_QUEUE"]=0
        Q_unremovableEvents["$TARGET_QUEUE"]=0
        echo "No events found in the dump file. Skipping queue."
        return 0
    fi

    #######################################################
    # Step 2: Analyze events in the DLQ dump              #
    #######################################################
    if [[ "$TARGET_QUEUE" == "pn-ss-transformation-raster-queue-DLQ" ]]; then
        ANALYSIS_SCRIPT_DIR="$WORKDIR/check-sent-paper-attachment"
    else
        ANALYSIS_SCRIPT_DIR="$WORKDIR/analyze-safestorage-dlq"
    fi

    if [[ ! -d "$ANALYSIS_SCRIPT_DIR" ]]; then
        echo "Script directory '$ANALYSIS_SCRIPT_DIR' does not exist. Exiting."
        exit 1
    fi
    cd "$ANALYSIS_SCRIPT_DIR" || { echo "Failed to cd into '$ANALYSIS_SCRIPT_DIR'"; exit 1; }
    RESULTSDIR="$ANALYSIS_SCRIPT_DIR/results"
    node index.js --envName prod --dumpFile "$ORIGINAL_DUMP" --queueName "$TARGET_QUEUE"

    # Get the most recent analysis output file
    SAFE_TO_DELETE=$(find "$RESULTSDIR" -type f -name "safe_to_delete_$TARGET_QUEUE*" -exec ls -t1 {} + | head -1)
    if [[ -z "$SAFE_TO_DELETE" ]]; then
      echo "No removable events found for $TARGET_QUEUE. Skipping queue."
      Q_removableEvents["$TARGET_QUEUE"]=0
      Q_unremovableEvents["$TARGET_QUEUE"]=0
      return 0
    fi
    REMOVABLE_EVENTS=$(wc -l < "$SAFE_TO_DELETE")
    echo "Total removable events: $REMOVABLE_EVENTS"
    Q_removableEvents["$TARGET_QUEUE"]="$REMOVABLE_EVENTS"
    UNSAFE_TO_DELETE=$(find "$RESULTSDIR" -type f -name "need_further_analysis_$TARGET_QUEUE*" -exec ls -t1 {} + | head -1)
    if [[ "$UNSAFE_TO_DELETE" != "" ]]; then
        echo "Unremovable events found. Further analysis required."
        echo "Unremovable events file: $(realpath "$UNSAFE_TO_DELETE")"
        UNREMOVABLE_EVENTS=$(wc -l < "$UNSAFE_TO_DELETE")
        echo "Total unremovable events: $UNREMOVABLE_EVENTS"   
        Q_unremovableEvents["$TARGET_QUEUE"]="$UNREMOVABLE_EVENTS"
    else
        UNREMOVABLE_EVENTS=0
        Q_unremovableEvents["$TARGET_QUEUE"]="$UNREMOVABLE_EVENTS"
        echo "No unremovable events found."
    fi
    
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
        if [[ "$TARGET_QUEUE" == "pn-safestore_to_deliverypush-DLQ" ]]; then
            node index.js --account core --envName prod --queueName pn-safestore_to_deliverypush-DLQ --visibilityTimeout "$V_TIMEOUT" --fileName "$SAFE_TO_DELETE" 1>/dev/null
        else
            node index.js --account confinfo --envName prod --queueName "$TARGET_QUEUE" --visibilityTimeout "$V_TIMEOUT" --fileName "$SAFE_TO_DELETE" 1>/dev/null
        fi
        echo "Events purged from the SQS queue."
    fi

    #######################################################
    # Step 4: Move all generated files to OUTPUTDIR       #
    #######################################################
    mv "$ORIGINAL_DUMP" "$OUTPUTDIR/"
    mv "$SAFE_TO_DELETE" "$OUTPUTDIR/"
    echo "Files moved to $OUTPUTDIR."

    echo "Process for queue $TARGET_QUEUE completed."
}

# Main execution
if [[ "$QUEUE" == "all" ]]; then
    for q in "${SUPPORTED_QUEUES[@]}"; do
        process_queue "$q"
    done
else
    process_queue "$QUEUE"
fi

# Summary: Print totals for each processed queue.
echo "---------- Summary ----------"
for queue in "${!Q_totalEvents[@]}"; do
    echo "Queue: $queue"
    echo "  Total events: ${Q_totalEvents[$queue]}"
    echo "  Total removable events: ${Q_removableEvents[$queue]}"
    echo "  Total unremovable events: ${Q_unremovableEvents[$queue]}"
done