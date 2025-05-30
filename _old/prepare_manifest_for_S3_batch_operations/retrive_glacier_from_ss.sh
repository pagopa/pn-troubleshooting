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
Usage: $(basename "${BASH_SOURCE[0]}") [-h] -p <aws-profile-name> -b <bucket-name> -s <storage-class> -r <prefixes>
[-h]                      : this help message
-p <aws-profile-name>     : AWS profile name
-b <bucket-name>          : Bucket name
-s <storage-class>        : Storage class (e.g., GLACIER_IR)
-r <prefixes>             : Prefixes separated by comma (e.g., "PN-AAR,PN-LEGAL-FACT,PN-F24")
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  aws_profile_name=""
  bucket_name=""
  storage_class=""
  prefixes=""

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -p | --aws-profile-name) 
      aws_profile_name="${2-}"
      shift
      ;;
    -b | --bucket-name) 
      bucket_name="${2-}"
      shift
      ;;
    -s | --storage-class) 
      storage_class="${2-}"
      shift
      ;;
    -r | --prefixes) 
      prefixes="${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  # check required params and arguments
  [[ -z "${aws_profile_name}" ]] && usage 
  [[ -z "${bucket_name}" ]] && usage
  [[ -z "${storage_class}" ]] && usage
  [[ -z "${prefixes}" ]] && usage
  
  return 0
}

dump_params() {
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "AWS Profile Name:   ${aws_profile_name}"
  echo "Bucket Name:        ${bucket_name}"
  echo "Storage Class:      ${storage_class}"
  echo "Prefixes:           ${prefixes}"
}

# START SCRIPT

parse_params "$@"
dump_params

echo "STARTING EXECUTION"

out_dir="./output"

echo "create output dir and move to it"

mkdir -p "$out_dir" && cd "$out_dir"

echo "retrieving elements with storage class: $storage_class from $bucket_name...."

> manifest.csv

IFS=',' read -r -a prefix_array <<< "$prefixes"

for pref in "${prefix_array[@]}"; do
  echo "Processing files with prefix: $pref"
  keys=$(aws s3api list-objects-v2 --bucket "$bucket_name" --prefix "$pref" --query "Contents[?StorageClass=='$storage_class'].[Key]" --output text --profile "$aws_profile_name")
  for key in $keys; do
    echo "$bucket_name,$key" >> manifest.csv
  done
done

echo "Manifest CSV generated: manifest.csv"
echo "Upload the manifest.csv in another bucket, then run a aws s3 batch operation"

