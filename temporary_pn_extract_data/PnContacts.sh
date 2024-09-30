#!/bin/bash

output_file="PnData.csv"


# Script Usage
usage() {
    echo "Usage: $0 -p <AWS_PROFILE>  -o <OUTPUT_DIR>"
    exit 1
}

# Parsing
while getopts ":p:o:" opt; do
  case ${opt} in
    p )
      AWS_PROFILE=$OPTARG
      ;;
    o )
      OUTPUT_DIR=$OPTARG
      ;;
    \? )
      usage
      ;;
  esac
done

# Change directory for output
cd $OUTPUT_DIR

# Verify Variable
if [ -z "$AWS_PROFILE" ] || [ -z "$OUTPUT_DIR" ]; then
    echo "Error: AWS profile and output directory not provided."
    usage
fi

# Change AWS profile, readonly is ok!
AWS_PROFILE_READONLY=$AWS_PROFILE-ro
echo "Using AWS_PROFILE: $AWS_PROFILE_READONLY"

# Fuction count elements
count_items() {
  local sk_value=$1
  local filter_expression=$2
  local expression_attribute_values=$3

  # Aws command for query
  if [ -n "$filter_expression" ] && [ -n "$expression_attribute_values" ]; then
    local result=$(aws dynamodb scan \
      --table-name pn-UserAttributes \
      --filter-expression "$filter_expression" \
      --expression-attribute-values "$expression_attribute_values" \
      --profile $AWS_PROFILE_READONLY \
      --output json)
  else
    local result=$(aws dynamodb scan \
      --table-name pn-UserAttributes \
      --filter-expression "sk = :sk_value" \
      --expression-attribute-values '{":sk_value":{"S":"'"$sk_value"'"}}' \
      --profile $AWS_PROFILE_READONLY \
      --output json)
  fi

  # Elements Count
  local count=$(echo "$result" | jq '.Items | length')
  echo "$count"
}

# Fuction for sk value
rename_sk_value() {
  case $1 in
    "COURTESY#default#APPIO")
      echo "Utenti con AppIO abilitata"
      ;;
    "COURTESY#default#EMAIL")
      echo "Utenti con recapito Mail"
      ;;
    "COURTESY#default#SMS")
      echo "Utenti con recapito SMS"
      ;;
    "LEGAL#default#PEC")
      echo "Utenti con recapito PEC"
      ;;
    *)
      echo "$1"
      ;;
  esac
}

# List Keys
sk_values=("COURTESY#default#APPIO" "COURTESY#default#EMAIL" "COURTESY#default#SMS" "LEGAL#default#PEC")

# Query by year
for sk_value in "${sk_values[@]}"; do
  for year in 2023 2024; do
    if [ "$sk_value" == "COURTESY#default#APPIO" ]; then
      count=$(count_items "$sk_value" "sk = :sk_value AND begins_with(created, :year) AND addresshash = :addresshash_value" \
        '{":sk_value":{"S":"'"$sk_value"'"}, ":year":{"S":"'"$year"'"}, ":addresshash_value":{"S":"ENABLED"}}')
    else
      count=$(count_items "$sk_value" "sk = :sk_value AND begins_with(created, :year)" \
        '{":sk_value":{"S":"'"$sk_value"'"}, ":year":{"S":"'"$year"'"}}')
    fi

    renamed_value=$(rename_sk_value "$sk_value")
    echo "$renamed_value $year,$count" >> "$output_file"
  done
done

# Confirm
echo "Results of Scan on DynamoDb have been written to $OUTPUT_DIR/$OUTPUT_FILE"