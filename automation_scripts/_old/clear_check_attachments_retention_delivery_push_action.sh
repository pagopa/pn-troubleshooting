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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] -e <env-name>  -w <work-dir>
    [-h]                      : this help message
    -e <env-name>             : env name
    -w <work-dir>             : work directory
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  queue_name="pn-delivery_push_actions-DLQ"
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

  # check required params and arguments
  [[ -z "${env_name-}" ]] && usage 
  [[ -z "${work_dir-}" ]] && usage

  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "Env:                ${env_name}"
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

echo "DUMPING SQS..."
cd "$work_dir"
node ./dump_sqs/dump_sqs.js --awsProfile sso_pn-core-$env_name --queueName $queue_name --visibilityTimeout 60
dumped_file=$(find ./dump_sqs/result -type f -exec ls -t1 {} + | head -1)
echo "$dumped_file"

echo "RETRIEVING IUN..."
check_attachments_retention_file="./dump_sqs/result/check_attachments_retention.json"
iuns_file="./dump_sqs/result/iuns.txt"
cat $dumped_file | jq -c '.[]' | grep "CHECK_ATTACHMENT_RETENTION" | jq -r '.Body | fromjson | .iun' | sort | uniq  > $iuns_file 

jq -r -c '.[]' $dumped_file | jq -r -c '{"Body": .Body, "MD5OfBody": .MD5OfBody, "MD5OfMessageAttributes": .MD5OfMessageAttributes}' | grep "CHECK_ATTACHMENT_RETENTION" > $check_attachments_retention_file

attachments_path="./retrieve_attachments_from_iun/results/"
remove_file ${attachments_path}attachments.json
echo "RETRIEVING ATTACHMENT..."
node ./retrieve_attachments_from_iun/index.js --envName $env_name-ro --fileName $iuns_file
remove_file ${attachments_path}aar.json

result_file="./increase_doc_retention_for_late_notifications/files/log.json"
remove_file "$result_file"
echo "REMOVING DELETE MARKER..."
node increase_doc_retention_for_late_notifications/index.js --envName $env_name --directory $attachments_path

iun_tmp="./automation_scripts/iun_tmp.txt"
remove_file "$iun_tmp"
#JQ di estrazione degli attachments che hanno il delete marker removed a false
jq -r 'select(.deletionMarkerRemoved == false and .error) | .iun' $result_file > $iun_tmp

result="./automation_scripts/to_remove_check_attachments.txt"
remove_file "$result"

while IFS= read -r line; do
  cat $check_attachments_retention_file | grep "$line" >> $result
done < "$iun_tmp"

remove_file "$iun_tmp"

echo "OUTPUT AVAILABLE IN $result"

echo "EXECUTION COMPLETE"

