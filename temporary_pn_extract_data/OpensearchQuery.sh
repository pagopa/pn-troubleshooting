#!/bin/bash

set -e

# Script Usage
usage() {
    echo "Usage: $0 -p <AWS_PROFILE> -s <SECRET_NAME> -o <OUTPUT_DIR>"
    exit 1
}

# Parsing 
while getopts ":p:s:o:" opt; do
  case ${opt} in
    p )
      AWS_PROFILE=$OPTARG
      ;;
    s )
      SECRET_NAME=$OPTARG
      ;;
    o )
      OUTPUT_DIR=$OPTARG
      ;;
    \? )
      usage
      ;;
  esac
done

# Verify Variable
if [ -z "$AWS_PROFILE" ] || [ -z "$SECRET_NAME" ] || [ -z "$OUTPUT_DIR" ]; then
    echo "Error: AWS profile, secret name, or output directory not provided."
    usage
fi

# Retrive Secret
echo "Retrieving OpenSearch credentials from AWS Secrets Manager..."
SECRET_OUTPUT=$(aws secretsmanager get-secret-value --profile "$AWS_PROFILE" --secret-id "$SECRET_NAME" --query 'SecretString' --output text)

# Put Secret in Variable
OPENSEARCH_USERNAME=$(echo "$SECRET_OUTPUT" | jq -r .username)
OPENSEARCH_PASS=$(echo "$SECRET_OUTPUT" | jq -r .password)

# Show Username and Password for Checking
echo "The OpenSearch Username Retrieved by Secret is: $OPENSEARCH_USERNAME"
echo "The OpenSearch Password Retrieved by Secret is: $OPENSEARCH_PASS"

if [ -z "$OPENSEARCH_USERNAME" ] || [ -z "$OPENSEARCH_PASS" ]; then
    echo "Error: Unable to retrieve OpenSearch credentials from secret."
    exit 1
fi

# Retrive Openserch Domain Name, take ONLY the first Name
echo "Finding OpenSearch domain name..."
DOMAIN_NAME=$(aws opensearch list-domain-names \
    --profile "$AWS_PROFILE" \
    --query "DomainNames[0].DomainName" \
    --output text)

if [ -z "$DOMAIN_NAME" ]; then
    echo "Error: No OpenSearch domain found."
    exit 1
fi

echo "Found OpenSearch domain name: $DOMAIN_NAME"

# Retrice Domain Endpoint for Opensearch anc Check if the output exist
echo "Finding OpenSearch domain endpoint..."
DOMAIN_ENDPOINT=$(aws opensearch describe-domains \
    --domain-names "$DOMAIN_NAME" \
    --query "DomainStatusList[0].Endpoints" \
    --output text \
    --profile "$AWS_PROFILE")

if [ "$DOMAIN_ENDPOINT" == "None" ]; then
    echo "Error: Endpoint for the OpenSearch domain is 'None'."
    exit 1
fi

echo "Found OpenSearch domain endpoint: $DOMAIN_ENDPOINT"

# Retrive ID of Ec2 instance for SSM Tunnel
echo "Finding EC2 instance ID with tag Name=pn-core-bastion-host..."
INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=pn-core-bastion-host" \
    --query "Reservations[0].Instances[0].InstanceId" \
    --output text \
    --profile "$AWS_PROFILE")

if [ -z "$INSTANCE_ID" ]; then
    echo "Error: No EC2 instance found with tag Name=pn-core-bastion-host."
    exit 1
fi

echo "Found EC2 instance ID: $INSTANCE_ID"

# Configuration Variables
output_file="PnData.csv"
current_date=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
TUNNEL_PID=0

# Opensearch query
scroll_opensearch_for_year() {
  start_date=$1
  end_date=$2

  scroll_output=$(curl -s -X GET "https://localhost:5601/_search?scroll=1m" \
       -H 'Content-Type: application/json' \
       -u "$OPENSEARCH_USERNAME:$OPENSEARCH_PASS" \
       -d "{
             \"size\": 10000,
             \"_source\": [\"iun\", \"@timestamp\"],
             \"query\": {
               \"bool\": {
                 \"must\": [
                   { \"match_all\": {} }
                 ],
                 \"filter\": [
                   { \"match_phrase\": { \"aud_type\": \"AUD_NT_VIEW_RCP\" } },
                   { \"match_phrase\": { \"message\": \"[AUD_NT_VIEW_RCP] SUCCESS - getReceivedNotification\" } },
                   { \"match_phrase\": { \"uid_prefix\": \"IO-PF\" } },
                   {
                     \"range\": {
                       \"@timestamp\": {
                         \"gte\": \"$start_date\",
                         \"lte\": \"$end_date\",
                         \"format\": \"strict_date_optional_time\"
                       }
                     }
                   }
                 ]
               }
             }
           }" --insecure)

  scroll_id=$(echo "$scroll_output" | jq -r '._scroll_id')

  hits=$(echo "$scroll_output" | jq -c '.hits.hits[] | {iun: ._source.iun, timestamp: ._source["@timestamp"]}')

  while true; do
    scroll_output=$(curl -s -X GET "https://localhost:5601/_search/scroll" \
      -H 'Content-Type: application/json' \
      -u "$OPENSEARCH_USERNAME:$OPENSEARCH_PASS" \
      -d "{
            \"scroll\": \"1m\",
            \"scroll_id\": \"$scroll_id\"
          }" --insecure)

    scroll_id=$(echo "$scroll_output" | jq -r '._scroll_id')

    new_hits=$(echo "$scroll_output" | jq -c '.hits.hits[] | {iun: ._source.iun, timestamp: ._source["@timestamp"]}')
    
    if [[ "$new_hits" == "" ]]; then
      break
    fi

    hits="$hits"$'\n'"$new_hits"
  done

  echo "$hits"
}

# SSM start Fuction
start_ssm_tunnel() {
    echo "Starting SSM tunnel..."
    aws --profile "$AWS_PROFILE" ssm start-session \
        --target "$INSTANCE_ID" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost \
        --parameters "{\"portNumber\":[\"443\"],\"localPortNumber\":[\"5601\"],\"host\":[\"$DOMAIN_ENDPOINT\"]}" > /dev/null 2>&1 &
    
    TUNNEL_PID=$!
    
    echo "SSM tunnel started with PID $TUNNEL_PID."
}

# SSM stop Fuction
cleanup() {
    if [ $TUNNEL_PID -ne 0 ]; then
        echo "Cleaning up..."
        pkill -P $TUNNEL_PID || true
        echo "SSM tunnel closed."
    fi
}

# Inzialize Trap in case of an arror
trap cleanup EXIT

# Start SSM
start_ssm_tunnel

# Sleep for 10 seconds before start the query
echo "Waiting for 10 seconds to ensure the tunnel is fully established..."
sleep 10
echo "Querying OpenSearch..."

# Query 2023
output_2023=$(scroll_opensearch_for_year "2023-01-01T00:00:00.000Z" "2023-12-31T23:59:59.999Z")

# Query 2024
output_2024=$(scroll_opensearch_for_year "2024-01-01T00:00:00.000Z" "$current_date")

# Merge the results 2023 and 2024
combined_output=$(echo -e "$output_2023\n$output_2024" | jq -s '[.[] | {iun: .iun, timestamp: .timestamp}] | sort_by(.timestamp)')

# Remove Duplicates IUN and count it by year
unique_iun=$(echo "$combined_output" | jq 'unique_by(.iun)')

count_2023=$(echo "$unique_iun" | jq '[.[] | select(.timestamp | startswith("2023"))] | length')
count_2024=$(echo "$unique_iun" | jq '[.[] | select(.timestamp | startswith("2024"))] | length')

# Change directory for output
cd $OUTPUT_DIR

# Print Output in csv file
echo "Numero di notifiche Visualizzate da AppIO 2023,$count_2023" >> "$output_file"
echo "Numero di notifiche Visualizzate da AppIO 2024,$count_2024" >> "$output_file"

# Confirm
echo "Results Query Opensearch have been written to $OUTPUT_DIR/$OUTPUT_FILE"
