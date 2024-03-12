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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] -e <env-name> -q <queue-name> -w <work-dir>
    [-h]                      : this help message
    -e <env-name>             : env name
    -w <work-dir>             : work directory
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  work_dir=$HOME
  env_name=""

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -e | --env-name) 
      env_name="${2-}"
      shift
      ;;
    -w | --work-dir) 
      work_dir="$work_dir${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "Env:                ${env_name}"
  echo "Work directory:     ${work_dir}"
}

# START SCRIPT

parse_params "$@"
dump_params

echo "STARTING EXECUTION"

echo "DUMPING SQS..."
cd "$work_dir"
queue_name='pn-ec-tracker-cartaceo-errori-queue-DLQ.fifo'
node ./dump_sqs/dump_sqs.js --awsProfile sso_pn-confinfo-$env_name --queueName $queue_name --visibilityTimeout 30
dumped_file=$(find ./dump_sqs/result -type f -exec ls -t1 {} + | head -1)
echo "$dumped_file"

echo "CHECKING EVENTS..."
node ./false_negative_paper_error/index.js --envName $env_name --fileName $dumped_file --dryrun

while true; do
    read -p "Do you want remove false negative events? [y/n]" response
    case $response in
        [Yy]* ) echo "Removing false negative events."; break;;
        [Nn]* ) echo "END EXECUTION."; exit;;
        * ) echo "please, 'y' or 'n'.";;
    esac
done

node ./false_negative_paper_error/index.js --envName $env_name --fileName $dumped_file

echo "EXECUTION COMPLETE"

