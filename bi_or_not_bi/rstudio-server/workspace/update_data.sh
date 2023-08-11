#! /bin/bash -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

if ( [ ! -f "${SCRIPT_DIR}/.env" ] ) then
  echo "You have to create a file called .env into script directory (${SCRIPT_DIR}/.env)"
  echo "With 3 lines"
  echo "AWS_PROFILE= .... the AWS profile you want use to update data files"
  echo "AWS_REGION= ....  the AWS region you want use to update data files"
  echo "LOG_BUCKET= ....  the bucket where you want read cdc from"
  exit 1
fi

source ${SCRIPT_DIR}/.env

echo "- Go to data directory"
mkdir -p "${SCRIPT_DIR}/data"
cd ${SCRIPT_DIR}/data

echo "- List onboarded istitutions"
aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
    dynamodb scan \
    --table-name "pn-OnboardInstitutions" \
    --max-items 100000 \
  | jq -r '.Items| .[] | tojson' > enti.jsons

echo "- List enabled apikeys"
aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  dynamodb scan \
  --table-name "pn-apiKey" \
  --scan-filter '{"status":{"AttributeValueList":[ {"S":"ENABLED"} ],"ComparisonOperator": "EQ"}}' \
  --attributes-to-get "id" "x-pagopa-pn-cx-id" "pdnd" \
  --max-items 50000 \
  | jq -r '.Items| .[] | tojson' > apikey.jsons

echo "- Download new CDC"
aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
    s3 sync "s3://${LOG_BUCKET}/cdcTos3/" cdc

