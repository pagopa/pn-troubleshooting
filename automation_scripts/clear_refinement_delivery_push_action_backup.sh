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
node ./dump_sqs/dump_sqs.js --awsProfile sso_pn-core-$env_name --queueName $queue_name --visibilityTimeout 120
dumped_file=$(find ./dump_sqs/result -type f -exec ls -t1 {} + | head -1)
echo "$dumped_file"

echo "RETRIEVING IUN..."
refinement_file="./dump_sqs/result/refinement.txt"
iuns_file="./dump_sqs/result/iuns.txt"
cat $dumped_file | jq -c '.[]' | grep "REFINEMENT_NOTIFICATION" > $refinement_file 
cat $dumped_file | jq -r '.[] | .Body | fromjson | select(.type == "REFINEMENT_NOTIFICATION") | .iun' > $iuns_file

category_path="./check_category_from_iun/results"
category_path_result=${category_path}/found.txt
echo "CHECK CATEGORY FROM IUN..."
remove_dir "$category_path"
node ./check_category_from_iun/index.js --envName $env_name-ro --fileName $iuns_file --category REFINEMENT


regex=$(paste -sd '|' "$category_path_result")
result_tmp="./automation_scripts/to_remove_tmp.txt"
result="./automation_scripts/to_remove.txt"

remove_file "$result_tmp"
remove_file "$result"

echo "PREPARING FILE WITH DELETE INFO..."
while IFS= read -r row; do
  grep $row $refinement_file >> $result_tmp
done < "$category_path_result"

cat $result_tmp | jq -r -c '{"Body": .Body, "MD5OfBody": .MD5OfBody, "MD5OfMessageAttributes": .MD5OfMessageAttributes}' > $result

remove_file "$result_tmp"

echo "OUTPUT AVAILABLE IN $result"

echo "EXECUTION COMPLETE"

