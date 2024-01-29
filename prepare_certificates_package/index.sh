#!/bin/sh

ENV_NAME=$1

if [ -z "$ENV_NAME" ]; then
    echo "Please provide environment name as first argument"
    exit 1
fi

# aws cli get ssm parameter by name
# https://docs.aws.amazon.com/cli/latest/reference/ssm/get-parameter.html

CURRENT_DATE=$(date +%Y%m%d%H%M%S)
INFOCAMERE_NEXT_CERT_NAME=/pn-national-registries/infocamere-cert-next
INFOCAMERE_TMP_FILE=infocamere-tmp.crt
aws --profile sso_pn-core-$ENV_NAME ssm get-parameter --name $INFOCAMERE_NEXT_CERT_NAME --with-decryption --query Parameter.Value --output text | jq -r '.cert' > $INFOCAMERE_TMP_FILE
openssl base64 -d -A -in $INFOCAMERE_TMP_FILE -out infocamere-next-${ENV_NAME}-${CURRENT_DATE}.crt

rm $INFOCAMERE_TMP_FILE

ADE_NEXT_CERT_NAME=/pn-national-registries/ade-api-cert-next
ADE_TMP_FILE=ade-tmp.crt
aws --profile sso_pn-core-$ENV_NAME ssm get-parameter --name $ADE_NEXT_CERT_NAME --with-decryption --query Parameter.Value --output text | jq -r '.cert' > $ADE_TMP_FILE
openssl base64 -d -A -in $ADE_TMP_FILE -out ade-next-${ENV_NAME}-${CURRENT_DATE}.crt

rm $ADE_TMP_FILE