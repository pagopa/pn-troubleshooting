#!/bin/sh

set -euo pipefail

usage() {
  echo "Error: missing required parameters."
  echo "Usage: $0 -r <region> -e <environment> -s <secret_name>"
  exit 1
}


# Variables
TOKEN=""
REGION=""
ENV=""
SECRET_NAME=""


while getopts "r:e:s:" opt; do
  case ${opt} in
    r) REGION="$OPTARG" ;;
    e) ENV="$OPTARG" ;;
    s) SECRET_NAME="$OPTARG" ;;
    *) usage ;;
  esac
done

if [ -z "$REGION" ] || [ -z "$ENV" ] || [ -z "$SECRET_NAME" ]; then
  usage
fi

if [ -z "$TOKEN" ]; then
  echo -n "Enter GitHub token (input hidden): "
  read -r -s TOKEN
  echo
fi


PROFILES=("sso_pn-core-${ENV}" "sso_pn-confinfo-${ENV}")

# Update the secret in both accounts
for PROFILE in "${PROFILES[@]}"; do
  echo "Updating secret '$SECRET_NAME' in profile '$PROFILE' (region: $REGION)..."
  
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$TOKEN" \
    --region "$REGION" \
    --profile "$PROFILE"

  echo "Secret successfully updated in '$PROFILE'"
done
