#! /bin/bash -ex
if [ $# -ne 2 ]; then
    echo "usage: $0 <aws-profile> <pa_id>"
    exit 1
fi
AWS_PROFILE=$1
PA_ID=$2

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
AWS_REGION=eu-south-1
AWS_PAGER=""

STARTDATE=$(date -v-30M +%s)
ENDDATE=$(date +%s)
STARTDATE_H=$(date -r $STARTDATE)
ENDDATE_H=$(date -r $ENDDATE)
FILTER="{ \$.cx_id =\"${PA_ID}\" && \$.message=\"consumeEventStream requestEventId*returnedlastEventId*\" }"
echo "- Download events from $STARTDATE_H to $ENDDATE_H"
echo "- with filter $FILTER"

aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
    logs filter-log-events \
    --log-group-name /aws/ecs/pn-delivery-push \
    --start-time ${STARTDATE}000 \
    --end-time ${ENDDATE}000 \
    --limit 10000 \
    --filter-pattern "$FILTER" >consumeEventStream.json

cat consumeEventStream.json | jq -r '.events[] .message | fromjson | (."@timestamp" + ", " + .message)'

echo -n "PA: "
aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
    dynamodb get-item \
    --table-name pn-OnboardInstitutions \
    --key  "{\"id\": {\"S\": \"$PA_ID\"}}" \
    --attributes-to-get "description" "ipaCode" \
| jq -r '(.Item.description.S + ", " + .Item.ipaCode.S)'       
