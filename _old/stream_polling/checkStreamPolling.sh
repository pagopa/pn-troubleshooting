#! /bin/bash -ex

if [ $# -ne 1 ]; then
    echo "usage: $0 <aws-profile>"
    exit 1
fi
AWS_PROFILE=$1

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

AWS_REGION=eu-south-1
AWS_PAGER=""

STARTDATE=$(date -v-10M +%s)
ENDDATE=$(date +%s)
STARTDATE_H=$(date -r $STARTDATE)
ENDDATE_H=$(date -r $ENDDATE)
echo -n "- Download events from $STARTDATE_H to $ENDDATE_H"

aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
    logs filter-log-events \
    --log-group-name /aws/ecs/pn-delivery-push \
    --start-time ${STARTDATE}000 \
    --end-time ${ENDDATE}000 \
    --limit 10000 \
    --filter-pattern "consumeEventStream requestEventId=" >events.json
cat events.json | jq -r '.events[] .message | fromjson | .cx_id' | sort | uniq -c | sort -r >polling-count.txt

echo "Extraction ended see polling-count.txt"
