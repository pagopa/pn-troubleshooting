#!/bin/bash

ENV=$1
SQS_DUMP_FILE=$2

# ---- Functions ---

function _lastRedriveDate {

    QUEUE_URL=$(aws sqs list-queues --queue-name-prefix pn-national_registry_gateway_inputs-DLQ --profile sso_pn-core-${ENV} | \
        jq -r '.QueueUrls[]' )

    QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url $QUEUE_URL --attribute-names QueueArn \
    --profile sso_pn-core-${ENV} | jq -r '.Attributes.QueueArn')

    aws sqs list-message-move-tasks \
	--source-arn $QUEUE_ARN \
	--profile sso_pn-core-${ENV} | jq '.Results[].StartedTimestamp / 1000 | floor' | \
	xargs -I{} date -d @{} +"%Y-%m-%dT%H:%M%:z"
}

# ---- Script ----

# Print help message
if [ $# -ne 2 ] || [ $1 == "--help" ] || [ $1 == "-h" ]
then
    cat << EOF

    Usage: ${0} <env> <sqs dump file>

EOF
    exit 0
fi

REDRIVE_DATE=$(_lastRedriveDate)

# Ask if last redrive was executed yesterday
ANSW=""
while [ "$ANSW" != "yes" ] && [ "$ANSW" != "no" ]
do
    echo ""
    read -sp "IMPORTANT: Last redrive was executed in date \"${REDRIVE_DATE}\". Continue? [y/n]: " ANSW
    if [ "$ANSW" == "n" ]
    then
        echo -e "\nExit\n"
        exit 0
    fi
done

echo -e "\n\n --> Converting SQS dump into a JSON inline file..."
jq -c '.[]' $SQS_DUMP_FILE > INLINE_${SQS_DUMP_FILE}

echo -e "\n --> Executing check_nr_response script..."
node ../check_nr_response/index.js \
    --env $ENV \
    --sqsDumpFile INLINE_${SQS_DUMP_FILE} | tee OUTPUT_${SQS_DUMP_FILE}

echo -e "\n --> Cleaning and sorting output file..."
sed -i '1,4d' OUTPUT_${SQS_DUMP_FILE}

# Select only JSON line where:
# - "approxElapsedDaysFromNow" >= 5 and 
# - "isNrResponsePresent" == false

jq -s '.[] | select(.approxElapsedDaysFromNow >= 5 and .isNrResponsePresent == false)' OUTPUT_${SQS_DUMP_FILE} | \
    jq -s '. | sort_by(.approxElapsedDaysFromNow) | reverse' | \
    jq -c '.[]' > SORTED_${SQS_DUMP_FILE}

echo -e "\n --> Obtain last redrive date..."

echo -e "\n --> Obtain report..."
node index.js \
      --env $ENV \
      --inputFile SORTED_${SQS_DUMP_FILE} \
      --redriveDate $REDRIVE_DATE
      
echo -e "\n --> Done.\n"