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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] -e <env-name> -w <work-dir>  [-t <visibility-timeout>][--channelType <channel-type>] [--purge]
    [-h]                      : this help message
    -e <env-name>             : env name
    -w <work-dir>             : work directory
    [-t <visibility-timeout>] : visibility timeout
    [-c <channel-type>]       : channel type 
    [--purge]                 : remove elements
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  work_dir=$HOME
  env_name=""
  channel_type=""
  purge=false

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
    -t | --visibility-timeout) 
      visibility_timeout="${2-}"
      shift
      ;;
    -c | --channel-type) 
      channel_type="${2-}"
      shift
      ;;
    --purge) 
      purge=true
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

  # check required params and arguments
  [[ -z "${env_name-}" ]] && usage 
  [[ -z "${work_dir-}" ]] && usage
  channel_type="${channel_type:-all}"
  visibility_timeout="${visibility_timeout:-30}"
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "Env:                ${env_name}"
  echo "Work directory:     ${work_dir}"
  echo "Channel type:       ${channel_type}"
  echo "Visibility timeout: ${visibility_timeout}"

}

remove_file() {
  file_path=$1  
  echo "cleaning $file_path"
  if [[ -f $file_path ]]; then
    rm $file_path
    echo "file $file_path has been removed"
  else
    echo "file $file_path does not exist."
  fi
}

remove_dir() {
  directory_path=$1  
  echo "cleaning $directory_path"
  if [[ -d $directory_path ]]; then
    rm -r $directory_path
    echo "directory $directory_path has been removed"
  else
    echo "directory $directory_path does not exist."
  fi
}

# START SCRIPT

parse_params "$@"
dump_params

echo "STARTING EXECUTION"

if [[ "$channel_type" == "all" ]]; then
  channels=("email" "pec" "cartaceo" "sms")
else
  channels=("$channel_type")
fi

for channel in "${channels[@]}"; do
  echo "Handling channel: $channel"
  queue_name=pn-ec-tracker-$channel-errori-queue-DLQ.fifo
  
  echo "DUMPING SQS..."
  cd "$work_dir"
  node ./dump_sqs/dump_sqs.js --awsProfile sso_pn-confinfo-$env_name --queueName $queue_name --visibilityTimeout $visibility_timeout
  dumped_file=$(find ./dump_sqs/result -type f -exec ls -t1 {} + | head -1)
  echo "$dumped_file"

  #node ./delivery-push-action-PN-11794/index.js --envName $env_name-ro --fileName $refinement_file
  result=./false_negative_ec_tracker/results/to_remove_tracker_${channel}.json
  remove_file "$result"
  node ./false_negative_ec_tracker/index.js --envName $env_name --fileName $dumped_file --channelType $channel
  if [[ -f $result ]]; then
    number_element=$(jq -c . "$result" | wc -l)
    if $purge; then
      echo "Removing from sqs $queue_name. Waiting 30 seconds before start"
      sleep $visibility_timeout
      node ./remove_from_sqs/index.js --account confinfo --envName $env_name --queueName $queue_name --visibilityTimeout $visibility_timeout --fileName $result
      echo "Removed $number_element elements from sqs $queue_name"
    else
      echo "DRYRUN: Removing from sqs $queue_name"
      echo "DRYRUN: Removed $number_element elements from sqs $queue_name"
    fi
  else 
    echo "No element to remove for $queue_name"
  fi 
done

remove_dir "$work_dir/results"

echo "END EXECUTION"