#!/usr/bin/env bash

# Esempio 
#
# ./download.sh -a http://localhost:8889 -c pn-test -k PN_LEGAL_FACTS_ST-dbb4a4f4aeb14dd78e72f69c141bb4b9.pdf
# ./download.sh -a http://localhost:8889 -c pn-radd-fsu -k PN_RADD_FSU_ATTACHMENT-7e50650467d045b6b572ddff8b1bc279.pdf
#
    
set -Eeuo pipefail
trap cleanup SIGINT SIGTERM ERR EXIT
    
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)
    
usage() {
      cat <<EOF
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] [-v] [-f] -p param_value arg1 [arg2...]
    
    Script description here.
    
    Available options:
    
    -h, --help        Print this help and exit
    -v, --verbose     Print script debug info
    -a, --api         API Endpoint  (mandatory)
    -k, --doc-key     Key of the document to download (mandatory)
    -p, --stage       Stage (default: dev)
    -c, --cx          (cx: default pn-delivery-001)
EOF
  exit
}

    
cleanup() {
  trap - SIGINT SIGTERM ERR EXIT
  # script cleanup here
}
  

setup_colors() {
   if [[ -t 2 ]] && [[ -z "${NO_COLOR-}" ]] && [[ "${TERM-}" != "dumb" ]]; then
     NOFORMAT='\033[0m' RED='\033[0;31m' GREEN='\033[0;32m' ORANGE='\033[0;33m' BLUE='\033[0;34m' PURPLE='\033[0;35m' CYAN='\033[0;36m' YELLOW='\033[1;33m'
   else
        NOFORMAT='' RED='' GREEN='' ORANGE='' BLUE='' PURPLE='' CYAN='' YELLOW=''
   fi
}
    
msg() {
  echo >&2 -e "${1-}"
}
    
die() {
  local msg=$1
  local code=${2-1} # default exit status 1
  msg "$msg"
  exit "$code"
}

parse_params() {
  # default values of variables set from params
  doc_key=""
  api_endpoint=''
  cx='pn-delivery-001'
  doc_type=''
  file=''
  stage=''

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -v | --verbose) set -x ;;
    --no-color) NO_COLOR=1 ;;
    -p | --stage) 
      stage="${2-}"
      shift
      ;;
    -k | --doc-key) 
      doc_key="${2-}"
      shift
      ;;
    -a | --api) 
      api_endpoint="${2-}"
      shift
      ;;
    -c | --cx) 
      cx="${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

  # check required params and arguments
  [[ -z "${api_endpoint-}" ]] && die "Missing required parameter: api_endpoint"
  [[ -z "${doc_key-}" ]] && die "Missing required parameter: doc-key"
#  [[ ${#args[@]} -eq 0 ]] && die "Missing script arguments"

  return 0
}

parse_params "$@"
setup_colors
echo "curl -v  -X GET 
  -H \"x-pagopa-safestorage-cx-id: ${cx}\" 
  ${api_endpoint}/${stage}safe-storage/v1/files/${doc_key}"
curl -v  -X GET \
  -H "x-pagopa-safestorage-cx-id: ${cx}" \
  ${api_endpoint}/${stage}safe-storage/v1/files/${doc_key} \
  \
  | tee > ${TMPDIR}/out.txt


cat ${TMPDIR}/out.txt | jq

url=$( cat ${TMPDIR}/out.txt | jq -r ".download.url")
key=$( cat ${TMPDIR}/out.txt | jq -r ".key")
echo ""
#echo "PRESIGNED URL: $url" 
#echo "KEY: $key"

#curl -X GET \
#  -H "Content-TYpe: application/pdf" \
#  --output ${key}.pdf \
#  $url
curl -X GET \
  --output ./out/${key} \
  $url