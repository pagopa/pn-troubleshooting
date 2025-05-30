#!/usr/bin/env bash

set -ex

if ( [ $# -ne 3 ] ) then
  echo "This script encrypt/decrypt a SAML assertion"
  echo "Usage: $0 <profile> <environment> <saml-assertion-path>"
  echo "<profile> the profile to access AWS account"
  echo "<environment>: environment"
  echo "<saml-assertion-path>: saml assertion path"

  if ( [ "$BASH_SOURCE" = "" ] ) then
    return 1
  else
    exit 1
  fi
fi

AWS_PROFILE=$1
ENVIRONMENT=$2
SAML_ASSERTION_PATH=$3
AWS_REGION='eu-south-1'
PROJECT=spidhub

LogsPrivateKey=$(aws \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    secretsmanager get-secret-value \
    --no-paginate \
    --secret-id $PROJECT-$ENVIRONMENT-hub-login-logs \
    --query SecretString --output text |  jq -r '.LogsPrivateKey')

LOCAL_PRIVATE_KEY=logs-rsa-private-$ENVIRONMENT.pem
    
LF=$'\\\x0A'
echo $LogsPrivateKey | sed -e "s/-----BEGIN PRIVATE KEY-----/&${LF}/" -e "s/-----END PRIVATE KEY-----/${LF}&${LF}/" | sed -e "s/[^[:blank:]]\{64\}/&${LF}/g" | sed -e "s/^ //"> $LOCAL_PRIVATE_KEY

node index.js ${LOCAL_PRIVATE_KEY} ${SAML_ASSERTION_PATH}

# remove private key from local storage
rm $LOCAL_PRIVATE_KEY