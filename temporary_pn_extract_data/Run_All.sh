#!/bin/bash

# Script Usage
usage() {
    echo "Usage: $0 -p <AWS_PROFILE> -s <SECRET_NAME>"
    exit 1
}

# Variables inzialization
AWS_PROFILE=""
SECRET_NAME=""

# Parsing 
while getopts ":p:s:" opt; do
  case ${opt} in
    p )
      AWS_PROFILE=$OPTARG
      ;;
    s )
      SECRET_NAME=$OPTARG
      ;;
    \? )
      usage
      ;;
  esac
done

# Check Parsing Variables
if [ -z "$AWS_PROFILE" ] || [ -z "$SECRET_NAME" ]; then
  usage
fi

# Create Output dir if not exist and remove output file if exist
OUTPUT_DIR="output"

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "Creating directory $OUTPUT_DIR..."
    mkdir -p "$OUTPUT_DIR"
fi

OUTPUT_FILE="$OUTPUT_DIR/PnData.csv"
if [ -f "$OUTPUT_FILE" ]; then
    echo "Removing existing file $OUTPUT_FILE..."
    rm "$OUTPUT_FILE"
fi

# Define scripts to start
SCRIPT_DIR="$(pwd)"
OPENSEARCH_QUERY_SCRIPT="${SCRIPT_DIR}/OpensearchQuery.sh"
QUERY_SPARK_SCRIPT="${SCRIPT_DIR}/SparkQuery.sh"
PN_CONTACTS_SCRIPT="${SCRIPT_DIR}/PnContacts.sh"

# Verify if the scripts exists
if [ ! -x "$OPENSEARCH_QUERY_SCRIPT" ]; then
    echo "Error: $OPENSEARCH_QUERY_SCRIPT does not exist or is not executable."
    exit 1
fi

if [ ! -x "$QUERY_SPARK_SCRIPT" ]; then
    echo "Error: $QUERY_SPARK_SCRIPT does not exist or is not executable."
    exit 1
fi

if [ ! -x "$PN_CONTACTS_SCRIPT" ]; then
    echo "Error: $PN_CONTACTS_SCRIPT does not exist or is not executable."
    exit 1
fi

# Execute first script
echo "Running OpensearchQuery.sh with AWS_PROFILE=$AWS_PROFILE, SECRET_NAME=$SECRET_NAME, and OUTPUT_DIR=$OUTPUT_DIR..."
"$OPENSEARCH_QUERY_SCRIPT" -p "$AWS_PROFILE" -s "$SECRET_NAME" -o "$OUTPUT_DIR"
if [ $? -ne 0 ]; then
    echo "Error running OpensearchQuery.sh"
    exit 1
fi

# Execute second script
echo "Running SparkQuery.sh with AWS_PROFILE=$AWS_PROFILE and OUTPUT_DIR=$OUTPUT_DIR..."
"$QUERY_SPARK_SCRIPT" -p "$AWS_PROFILE" -o "$OUTPUT_DIR"
if [ $? -ne 0 ]; then
    echo "Error running SparkQuery.sh"
    exit 1
fi

# Execute third script
 echo "Running PnContacts.sh with AWS_PROFILE=$AWS_PROFILE and OUTPUT_DIR=$OUTPUT_DIR..."
 "$PN_CONTACTS_SCRIPT" -p "$AWS_PROFILE" -o "$OUTPUT_DIR"
 if [ $? -ne 0 ]; then
     echo "Error running PnContacts.sh."
     exit 1
# fi

echo "All scripts executed successfully. Check Output in $OUTPUT_DIR/$OUTPUT_FILE"
