#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_START_TIME=$(date +%s)

#############################################
# Usage
#############################################
usage() {
    cat <<EOF
Usage: $(basename "$0") -b <bucket> -f <output-file> -t <sns-topic>
  
  -b, --bucket            Nome bucket S3
  -f, --output-file       File di output generato da pippo2
  -t, --topic             ARN del topic SNS dove pubblicare l'URL
  -p, --profile           AWS CLI profile da utilizzare
  -h, --help              Mostra questo messaggio
EOF
    exit 1
}

#############################################
# Default values
#############################################
BUCKET=""
OUTPUT_FILE=""
SNS_TOPIC=""
PROFILE=""
STARTDIR=$(pwd)
GENERATED_FILES=()

echo "----------------------------------------------"
echo "Starting Paper Tracker Agent Script..."
echo STARTDIR: $STARTDIR
#############################################
# Cleanup
#############################################
cleanup() {
    for f in "${GENERATED_FILES[@]}"; do
        [[ -f "$f" ]] && rm -f "$f"
    done
}

prepare_cli_command() {
    local cmd="aws"
    if [[ -n "$PROFILE" ]]; then
        cmd+=" --profile $PROFILE"
    fi
    echo "$cmd"
    export AWS_CLI_COMMAND="$cmd"
}
#############################################
# Ensure node modules exist
#############################################
ensure_node_deps() {
    local dir="$1"
    if [[ ! -f "$dir/package.json" ]]; then
        echo "Error: package.json non trovato in $dir"
        cleanup
        exit 1
    fi
    if [[ ! -d "$dir/node_modules" ]]; then
        echo "node_modules mancante in $dir. Installazione..."
        (cd "$dir" && npm ci)
    fi
}

#############################################
# Parse parameters
#############################################
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        -b|--bucket)
            BUCKET="$2"
            shift 2
            ;;
        -t|--topic)
            SNS_TOPIC="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Parametro sconosciuto: $1"
            usage
            ;;
    esac
done

#############################################
# Validate PARAMETERS
#############################################
#if [[ -z "$BUCKET" || -z "$SNS_TOPIC" ]]; then
#    usage
#fi

#############################################
# STEP 1: RUN ATHENA QUERY
#############################################
run_athena() {
    ATHENA_DIR="./retrieve_from_athena_template"
    echo "----------------------------------------------"
    echo "Executing Athena query..."
    echo "Directory: $ATHENA_DIR"

    ensure_node_deps "$ATHENA_DIR"
    QUERY_NAME="extract_trackings"

    cd "$ATHENA_DIR"
    node index.js --envName prod --query ${QUERY_NAME}
    cd "$STARTDIR"

    ATHENA_DIR_RESULTS="$ATHENA_DIR/results/"
    echo "Checking results in: $ATHENA_DIR_RESULTS"

    LATEST_FILE=$(ls -t "$ATHENA_DIR_RESULTS" | head -n 1)
    echo "Latest file generated: $LATEST_FILE"

    if [[ -z "$LATEST_FILE" ]]; then
        echo "Errore: nessun file generato trovato in $ATHENA_DIR_RESULTS"
        exit 1
    fi

    ATHENA_RESULT=$(realpath "$ATHENA_DIR_RESULTS/$LATEST_FILE")
    echo "Query result file: $ATHENA_RESULT"

    export ATHENA_RESULT
}


#############################################
# STEP 2: RUN tracker check
#############################################
run_tracker_check() {
    echo "ATHENA RESULT FILE: $ATHENA_RESULT"
    TRACKER_CHECK_DIR="./tracker_check_dryrun"
    echo "----------------------------------------------"
    echo "Executing tracker check..."
    echo "Directory: $TRACKER_CHECK_DIR"

    ensure_node_deps "$TRACKER_CHECK_DIR"

    cd "$TRACKER_CHECK_DIR"

    CORE_AWS_PROFILE=""
    REGION=eu-south-1 
    INPUT_FILE="$ATHENA_RESULT"
    export CORE_AWS_PROFILE REGION INPUT_FILE
    node index.js
    #get latest file generated in output folder
    cd "$STARTDIR"
    TRACKER_CHECK_DIR_RESULTS="$TRACKER_CHECK_DIR/out/"
    echo "Checking results in: $TRACKER_CHECK_DIR_RESULTS"
    LATEST_FILE=$(ls -t "$TRACKER_CHECK_DIR_RESULTS" | head -n 1)
    echo "Latest file generated: $LATEST_FILE"
    if [[ -z "$LATEST_FILE" ]]; then
        echo "Errore: nessun file generato trovato in $TRACKER_CHECK_DIR_RESULTS"
        exit 1
    fi
    TRACKER_CHECK_RESULT=$(realpath "$TRACKER_CHECK_DIR_RESULTS/$LATEST_FILE")
    echo "Query result file: $TRACKER_CHECK_RESULT"

    export TRACKER_CHECK_RESULT
}

#############################################
# STEP 3: Upload file su S3
#############################################
upload_to_s3() {
    echo "----------------------------------------------"
    echo "Upload su S3..."
    echo "Bucket: $BUCKET"
    echo "File:   $TRACKER_CHECK_RESULT"

    if [[ ! -f "$TRACKER_CHECK_RESULT" ]]; then
        echo "Errore: file output non trovato: $TRACKER_CHECK_RESULT"
        exit 1
    fi

    #date suffix for output file
    DATE_PREFIX=$(date +%Y%m%d_%H%M%S)
    FILE_NAME="$DATE_PREFIX-tracker_check_result.csv"
    URI_FILE="s3://$BUCKET/tracker_check_result/$FILE_NAME"

    $AWS_CLI_COMMAND s3 cp "$TRACKER_CHECK_RESULT" "$URI_FILE"

    export URI_FILE
}

#############################################
# STEP 4: Generate presigned URL
#############################################
generate_url() {
    echo "----------------------------------------------"
    echo "Generazione presigned URL..."

    # Generate presigned URL valid for 72 hours 
    PRESIGNED_URL=$($AWS_CLI_COMMAND s3 presign "$URI_FILE" --expires-in 259200)

    echo "URL generato: $PRESIGNED_URL"

    export PRESIGNED_URL
}

#############################################
# STEP 5: Publish URL su SNS
#############################################
publish_sns() {
    echo "----------------------------------------------"
    echo "Pubblicazione su SNS topic: $SNS_TOPIC"

    MESSAGE="Il report di controllo delle spedizioni cartacee è disponibile al seguente link (valido per 72 ore): $PRESIGNED_URL"
    aws --profile sso_pn-core-dev sns publish --topic-arn "$SNS_TOPIC" --message "$MESSAGE" --subject "Report Controllo Spedizioni Cartacee"
    echo "Pubblicato con successo."
}

#############################################
# MAIN EXECUTION
#############################################
prepare_cli_command
run_athena
run_tracker_check
upload_to_s3
generate_url
publish_sns

echo "----------------------------------------------"
echo "Processo completato con successo."
echo "Durata totale: $(( $(date +%s) - SCRIPT_START_TIME )) secondi"
