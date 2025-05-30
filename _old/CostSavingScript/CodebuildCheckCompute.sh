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

  # Check required params and arguments
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

# START SCRIPT

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

# List of all codeubuild
projects=$(aws ${aws_command_base_args} codebuild list-projects --query "projects[]" --output text )

if [ -z "$projects" ]; then
  echo "There are not Codebuild Project."
  exit 0
fi

echo "Details of codebuild Project:"
for project in $projects; do
    details=$(aws ${aws_command_base_args} codebuild batch-get-projects --names "$project" --query "projects[0]" --output json  )
    
    project_name=$(echo "$details" | jq -r '.name')
    compute_type=$(echo "$details" | jq -r '.environment.computeType')
    image=$(echo "$details" | jq -r '.environment.image')

    echo "Project Name: $project_name"
    echo "Compute Type: $compute_type"
    echo "Image: $image"
    echo "------------------------------------"
done
