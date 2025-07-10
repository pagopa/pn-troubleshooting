#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_START_TIME=$(date +%s)

usage() {
    cat <<EOF
Usage: $(basename "$0") -w <work-dir> -c <channel-type|all> [-e <env>] [-t <visibility-timeout>] [--purge]
  -w, --work-dir           Working directory
  -c, --channel-type       Channel type to process. Supported values:
                           pec, email, cartaceo, sms, all
  -e, --env                Environment (prod, test, uat, hotfix). Default: prod
  -t, --visibility-timeout Visibility timeout in seconds (default: 30)
  --purge                  Purge events from the SQS queue
EOF
    exit 1
}

# Default values
WORKDIR=""
CHANNEL_TYPE=""
STARTDIR=$(dirname "$0")
OUTPUTDIR_BASE="$STARTDIR/output"
V_TIMEOUT=30
PURGE=false
ENV="prod"

cleanup() {
    for f in "${GENERATED_FILES[@]}"; do
        [[ -f "$f" ]] && rm -f "$f"
    done
}

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

if [[ -z "$WORKDIR" || -z "$CHANNEL_TYPE" ]]; then
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

ensure_node_deps() {
    local dir="$1"
    if [[ ! -f "$dir/package.json" ]]; then
        echo "Error: package.json not found in $dir"
        cleanup
        exit 1
    fi
    if [[ ! -d "$dir/node_modules" ]]; then
        echo "node_modules missing in $dir. Installing dependencies..."
        (cd "$dir" && npm ci)
    elif [[ -f "$dir/package-lock.json" ]]; then
        if [[ "$dir/package-lock.json" -nt "$dir/node_modules" ]]; then
            echo "package-lock.json is newer than node_modules in $dir. Reinstalling dependencies..."
            (cd "$dir" && npm ci)
        fi
    fi
}

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
    ensure_node_deps "$WORKDIR/dump_sqs"
    node dump_sqs.js --awsProfile "$AWS_PROFILE" --queueName "$TARGET_QUEUE" --visibilityTimeout "$V_TIMEOUT" 1>/dev/null

    # Get the most recent dump file
    ORIGINAL_DUMP=$(find "$WORKDIR/dump_sqs/result" -type f -name "dump_${TARGET_QUEUE}*" -newermt "@$SCRIPT_START_TIME" -exec ls -t1 {} + | head -1)
    if [[ -z "$ORIGINAL_DUMP" ]]; then
      echo "No dump file found for $TARGET_QUEUE. Skipping channel."
      C_totalEvents["$CHANNEL"]=0
      C_removableEvents["$CHANNEL"]=0
      C_unremovableEvents["$CHANNEL"]=0
      return 0
    fi

    ORIGINAL_DUMP=$(realpath "$ORIGINAL_DUMP")
    GENERATED_FILES+=("$ORIGINAL_DUMP")
    echo "Dump file: $ORIGINAL_DUMP"

    TOTAL_EVENTS=$(jq -c '.[]' "$ORIGINAL_DUMP" | wc -l)
    echo "Total events in SQS dump: $TOTAL_EVENTS"
    C_totalEvents["$CHANNEL"]="$TOTAL_EVENTS"
    if [[ $TOTAL_EVENTS -eq 0 ]]; then
        C_removableEvents["$CHANNEL"]=0
        C_unremovableEvents["$CHANNEL"]=0
        echo "No events found in the dump file. Skipping channel."
        cleanup
        return 0
    fi

    #######################################################
    # Step 2: Analyze events in the DLQ dump              #
    #######################################################
    ANALYSIS_SCRIPT_DIR="$WORKDIR/false_negative_ec_tracker"
    if [[ ! -d "$ANALYSIS_SCRIPT_DIR" ]]; then
        echo "Script directory '$ANALYSIS_SCRIPT_DIR' does not exist. Exiting."
        cleanup
        exit 1
    fi
    cd "$ANALYSIS_SCRIPT_DIR" || { echo "Failed to cd into '$ANALYSIS_SCRIPT_DIR'"; exit 1; }
    ensure_node_deps "$ANALYSIS_SCRIPT_DIR"
    RESULTSDIR="$ANALYSIS_SCRIPT_DIR/results"
    node index.js --envName "$ENV_NAME" --fileName "$ORIGINAL_DUMP" --channelType "$CHANNEL"

    # Get the most recent removable events file
    TO_REMOVE=$(find "$RESULTSDIR" -type f -name "to_remove_${CHANNEL}*" -newermt "@$SCRIPT_START_TIME" -exec ls -t1 {} + | head -1)
    if [[ -z "$TO_REMOVE" ]]; then
      echo "No removable events found for $CHANNEL. Skipping channel."
      C_removableEvents["$CHANNEL"]=0
      C_unremovableEvents["$CHANNEL"]=0
      cleanup
      return 0
    fi
    GENERATED_FILES+=("$TO_REMOVE")
    REMOVABLE_EVENTS=$(wc -l < "$TO_REMOVE")
    echo "Total removable events: $REMOVABLE_EVENTS"
    C_removableEvents["$CHANNEL"]="$REMOVABLE_EVENTS"

    # Sum lines from problem_found, to_keep, error files for unremovable events
    UNREMOVABLE_EVENTS=0
    for f in problem_found_${CHANNEL}* to_keep_${CHANNEL}* error_${CHANNEL}*; do
        FILEPATH=$(find "$RESULTSDIR" -type f -name "$f" -newermt "@$SCRIPT_START_TIME" -exec ls -t1 {} + | head -1 || true)
        GENERATED_FILES+=("$FILEPATH")
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
            cleanup
            exit 1
        fi
        cd "$WORKDIR/remove_from_sqs" || { echo "Failed to cd into '$WORKDIR/remove_from_sqs'"; exit 1; }
        ensure_node_deps "$WORKDIR/remove_from_sqs"
        echo "Waiting for the visibility timeout ($V_TIMEOUT seconds) to expire..."
        sleep "$V_TIMEOUT"
        echo "Purging events from the SQS queue..."
        node index.js --account confinfo --envName "$ENV_NAME" --queueName "$TARGET_QUEUE" --visibilityTimeout "$V_TIMEOUT" --fileName "$TO_REMOVE" 1>/dev/null
        find "$RESULTSDIR" -type f -name "to_remove_$CHANNEL*.json_result.json" | xargs rm
        echo "Events purged from the SQS queue."
    fi

    #######################################################
    # Step 4: Move all generated files to OUTPUTDIR       #
    #######################################################
    for f in "${GENERATED_FILES[@]}"; do
        [[ -f "$f" ]] && mv "$f" "$OUTPUTDIR/"
    done
    echo "Files moved to $OUTPUTDIR."

    echo "Process for channel $CHANNEL completed."
}

# Main execution
if [[ "$CHANNEL_TYPE" == "all" ]]; then
    for c in "${SUPPORTED_CHANNELS[@]}"; do
        GENERATED_FILES=()
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
    GENERATED_FILES=()
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