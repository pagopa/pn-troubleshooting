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
    -q <queue-name>           : queue name
    -w <work-dir>             : work directory
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  queue_name=""
  work_dir=$HOME
  env_name=""

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -e | --env-name) 
      env_name="${2-}"
      shift
      ;;
    -q | --queue-name) 
      queue_name="${2-}"
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

  # check required params and arguments
  [[ -z "${env_name-}" ]] && usage 
  [[ -z "${work_dir-}" ]] && usage
  [[ -z "${queue_name-}" ]] && usage

  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "Env:                ${env_name}"
  echo "Queue Name:         ${queue_name}"
  echo "Work directory:     ${work_dir}"
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

# START SCRIPT

parse_params "$@"
dump_params

echo "STARTING EXECUTION"

echo "DUMPING SQS..."
cd "$work_dir"
node ./dump_sqs/dump_sqs.js --awsProfile sso_pn-core-$env_name --queueName $queue_name --visibilityTimeout 20
dumped_file=$(find ./dump_sqs/result -type f -exec ls -t1 {} + | head -1)
echo "$dumped_file"

echo "RETRIEVING IUN..."
iuns_file="./dump_sqs/result/iuns.txt"
if [[ "$queue_name" == *"actions"* ]]; then
  cat $dumped_file | jq -r '.[] | .Body | fromjson | select(.type == "REFINEMENT_NOTIFICATION" or .type == "CHECK_ATTACHMENT_RETENTION") | .iun' | sort | uniq > $iuns_file 
else
  echo "JQ EXECUTING"
  cat $dumped_file | jq -r '.[] | .MessageAttributes | select(.eventType.StringValue == "NOTIFICATION_VIEWED") | .iun.StringValue' | sort | uniq > $iuns_file
fi

attachments_path="./retrieve_attachments_from_iun/results"
remove_file "$attachments_path/attachments.json"
echo "RETRIEVING ATTACHMENT..."
node ./retrieve_attachments_from_iun/index.js --envName $env_name --fileName $iuns_file
remove_file "$attachments_path/aar.json"

result_file="./increase_doc_retention_for_late_notifications/files/log.json"
echo "REMOVING DELETE MARKER..."
remove_file "$result_file"
node increase_doc_retention_for_late_notifications/index.js --envName $env_name --directory $attachments_path


fileKey_tmp="./automation_scripts/fileKey_tmp.txt"
#JQ di estrazione degli attachments che hanno il delete marker removed a true
jq -r 'select(.deletionMarkerRemoved == true) | .fileKey' $result_file > $fileKey_tmp
#Avvio dello script change document state in staged per gli attachments di cui sopra
node change_document_state/index.js --envName $env_name --fileName $fileKey_tmp --documentState staged
#Sleep di 10 secondi
sleep 10
#Avvio dello script change document state in attached per gli attachments di cui sopra sopra
node change_document_state/index.js --envName $env_name --fileName $fileKey_tmp --documentState attached

echo "EXECUTION COMPLETE"

