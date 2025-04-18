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
      echo "No dump file found. Exiting."
      exit 1
    fi
    echo "Dump file: $ORIGINAL_DUMP"
    TOTAL_EVENTS=$(wc -l < "$ORIGINAL_DUMP")
    echo "Total events in SQS dump: $TOTAL_EVENTS"

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
    ANALYSIS_OUTPUT=$(find "$RESULTSDIR" -type f -name "safe_to_delete_$TARGET_QUEUE*" -exec ls -t1 {} + | head -1)
    if [[ -z "$ANALYSIS_OUTPUT" ]]; then
      echo "No analysis output file found. Exiting."
      exit 1
    fi
    echo "Analysis output file: $ANALYSIS_OUTPUT"
    REMOVABLE_EVENTS=$(wc -l < "$ANALYSIS_OUTPUT")
    echo "Total events to remove: $REMOVABLE_EVENTS"

    if [[ $TOTAL_EVENTS -gt $REMOVABLE_EVENTS ]]; then
        echo "WARNING: Total events count is greater than the count of events to remove."
        echo "Please check the analysis outputs."
        echo "Outputs folder: $(realpath "$RESULTSDIR")"
    fi

    #######################################################
    # Step 3: Copy all generated files to OUTPUTDIR       #
    #######################################################
    cp "$ORIGINAL_DUMP" "$OUTPUTDIR/"
    cp "$ANALYSIS_OUTPUT" "$OUTPUTDIR/"
    echo "Files copied to $OUTPUTDIR."

    #######################################################
    # Step 4 (optional): Remove events from SQS queue     #
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
        node index.js --account confinfo --envName prod --queueName "$TARGET_QUEUE" --visibilityTimeout "$V_TIMEOUT" --fileName "$ANALYSIS_OUTPUT" 1>/dev/null
    fi

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