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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] -e <env-name> -w <work-dir>
    [-h]                      : this help message
    -e <env-name>             : env name
    -w <work-dir>             : work directory
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  queue_name="pn-external_channel_to_paper_channel-DLQ"
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
requestid_file="./dump_sqs/result/requestIdx.txt"
cat $dumped_file | jq -r '.[] | .Body | fromjson | .analogMail | .requestId' > $requestid_file

attachments_path="./retrieve_attachments_from_requestid/results/"
echo "RETRIEVING ATTACHMENT FROM REQUEST ID..."
if [[ -f $attachments_path/attachments.json ]]; then
  echo "cleaning attachments path"
  rm $attachments_path/aar.json
  rm $attachments_path/atti.json
fi
node ./retrieve_attachments_from_requestid/index.js --envName $env_name-ro --fileName $requestid_file

echo "COPY ATTI IN SINGLE PATH..."
mkdir -p ${attachments_path}tmp
cp ${attachments_path}atti.json ${attachments_path}tmp/atti.json

result_file="./increase_doc_retention_for_late_notifications/files/log.json"
echo "REMOVING DELETE MARKER..."
if [[ -f $result_file ]]; then
  echo "cleaning result path"
  rm $result_file
fi

node increase_doc_retention_for_late_notifications/index.js --envName $env_name --directory ${attachments_path}tmp
echo "DELETE MARKER REMOVED..."
rm -r ${attachments_path}tmp

echo "RETRIEVING FROM GLACIER"
node ./retrieve_glacier_s3/index.js --envName $env_name --fileName ${attachments_path}aar.json --expiration 7 --tier Bulk

echo "EXECUTION COMPLETE"

