#!/usr/bin/env bash

set -Eeuo pipefail
trap cleanup SIGINT SIGTERM ERR EXIT

cleanup() {
  trap - SIGINT SIGTERM ERR EXIT
  # script cleanup here
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)

usage() {
  cat <<EOF
Usage: $(basename "${BASH_SOURCE[0]}") [-h] -p <aws-profile> -r <aws-region>
[-h]                      : this help message
-p <aws-profile>          : aws-profile
-r <aws-region>           : aws-region
EOF
  exit 1
}

parse_params() {
  aws_profile=""
  aws_region=""

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -p | --profile)
      aws_profile="${2-}"
      shift
      ;;
    -r | --region)
      aws_region="${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  [[ -z "${aws_profile-}" ]] && usage
  [[ -z "${aws_region-}" ]] && usage

  return 0
}

dump_params() {
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "AWS Profile:        ${aws_profile}"
  echo "AWS Region:         ${aws_region}"
}

parse_params "$@"
dump_params

echo ""
echo "=== Base AWS command parameters"
aws_command_base_args=""
if [ ! -z "${aws_profile}" ]; then
  aws_command_base_args="${aws_command_base_args} --profile $aws_profile"
fi
if [ ! -z "${aws_region}" ]; then
  aws_command_base_args="${aws_command_base_args} --region  $aws_region"
fi
echo ${aws_command_base_args}

echo "STARTING EXECUTION"

PN_ENV=$(echo "$aws_profile" | sed 's/.*-//')
AWS_ACCOUNT=$(aws ${aws_command_base_args} sts get-caller-identity --query "Account" --output text)
OUTPUT_DIR=./output
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

# Condition for only No-Prod Accounts:
if [[ "$PN_ENV" == *"uat"* || "$PN_ENV" == *"prod"* ]]; then
  echo "cost saving not applicable in this env."
  exit 0
fi

#Process count Ecs Task fuction:
process_clusters() {
  CLUSTERS="$1"
  
  if [ -z "$CLUSTERS" ]; then
    echo "Clusters not exists."
    exit 1
  fi

  for CLUSTER in $CLUSTERS; do
    CLUSTER_NAME=$(basename "$CLUSTER")

    if [[ "$CLUSTER_NAME" == *"spidhub"* || "$CLUSTER_NAME" == *"logsaver"* ]]; then
      echo "Cluster $CLUSTER_NAME shifted."
      continue
    fi

    OUTPUT_FILE="desire_count_ecs_${CLUSTER_NAME}_${AWS_ACCOUNT}.json"
    services_count=()

    SERVICES=$(aws ${aws_command_base_args} ecs list-services --cluster "$CLUSTER" --query "serviceArns[]" --output text)

    if [ -n "$SERVICES" ]; then
      for SERVICE in $SERVICES; do
        SERVICE_NAME=$(basename "$SERVICE")
        MIN_TASKS_NUMBER=1

        # Only for Dev Account setting up actual Desired tasks in Clusters:
        if [[ "$PN_ENV" == *"dev"* ]]; then
          MIN_TASKS_NUMBER=$(aws ${aws_command_base_args} ecs describe-services --cluster "$CLUSTER" --services "$SERVICE_NAME" --query "services[0].desiredCount" --output text)
          MIN_TASKS_NUMBER=${MIN_TASKS_NUMBER:-1}
        else
          SERVICE_DIR=$(echo "$SERVICE_NAME" | sed 's/-microsvc.*//')
          CONFIG_FILE="pn-configuration/$PN_ENV/$SERVICE_DIR/scripts/aws/cfn/microservice-$PN_ENV-cfg.json"
          if [ -f "$CONFIG_FILE" ]; then
            MIN_TASKS_NUMBER=$(jq -r '.[].MinTasksNumber // empty' "$CONFIG_FILE")
            MIN_TASKS_NUMBER=${MIN_TASKS_NUMBER:-1}
          fi
        fi

        services_count+=("\"$SERVICE_NAME\": $MIN_TASKS_NUMBER")
      done
    fi

    if [ ${#services_count[@]} -gt 0 ]; then
      JSON_OUTPUT="{ $(IFS=', '; echo "${services_count[*]}") }"
      echo "$JSON_OUTPUT" > "$OUTPUT_FILE"
      echo "File generated: $OUTPUT_FILE."

      BUCKET_NAME=$(aws ${aws_command_base_args} s3 ls | awk '{print $3}' | grep cdartifactbucket | head -n 1)
      if [ -z "$BUCKET_NAME" ]; then
        echo "Bucket not exists."
        exit 1
      fi

      aws ${aws_command_base_args} s3 cp "$OUTPUT_FILE" "s3://$BUCKET_NAME/$OUTPUT_FILE"
      echo "File Uploaded to $BUCKET_NAME"
    else
      echo "There isn't service in the $CLUSTER_NAME."
    fi
  done
}

# Download Repo Configuration, not for Dev Env:
if [[ "$PN_ENV" == *"dev"* ]]; then
  CLUSTERS=$(aws ${aws_command_base_args} ecs list-clusters --query "clusterArns[]" --output text)
  process_clusters "$CLUSTERS"
else
  if [ ! -d "pn-configuration" ]; then
    git clone "$REPO_URL"
  else
    cd pn-configuration && git pull && cd ..
  fi
  CLUSTERS=$(aws ${aws_command_base_args} ecs list-clusters --query "clusterArns[]" --output text)
  process_clusters "$CLUSTERS"
fi
