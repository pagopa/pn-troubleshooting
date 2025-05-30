#!/bin/bash

env=$1
if [ -z "$env" ]; then
    echo "Usage: $0 <environment>"
    exit 1
fi

aws_params="--profile sso_pn-core-${env} --region eu-south-1"

# Get all log group names
log_groups=$(aws logs ${aws_params} describe-log-groups --query 'logGroups[*].logGroupName' --output text)

echo "Log groups WITHOUT 'Microservice' tag:"

for log_group in $log_groups; do
    # Get tags for each log group
    tags=$(aws logs ${aws_params} list-tags-log-group --log-group-name "$log_group" --query 'tags' --output json)
    
    # Check if 'Microservice' tag is absent
    if ! echo "$tags" | jq -e 'has("Microservice")' > /dev/null; then
        echo "$log_group"
    fi
done
