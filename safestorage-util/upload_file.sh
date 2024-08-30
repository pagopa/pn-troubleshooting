#!/usr/bin/env bash

# Esempio 
#
# ./upload_file.sh -a http://localhost:8889 -t PN_LEGAL_FACTS -s SAVED  -c pn-test  -f multa.pdf
# ./upload_file.sh -a http://localhost:8889 -t PN_LEGAL_FACTS_ST -s SAVED  -c pn-test  -f multa.pdf
# ./upload_file.sh -a http://localhost:8889 -c pn-radd-fsu  -f multa.pdf -t PN_RADD_FSU_ATTACHMENT -s PRELOADED
# ./upload_file.sh -a http://localhost:8889 -t PN_ADDRESSES_RAW -s SAVED  -c pn-address-manager  -y text/csv -f pippo.csv
# ./upload_file.sh -a http://localhost:8889 -t PN_ADDRESSES_RAW -s SAVED  -c pn-address-manager  -y text/csv -f prova.csv
# ./upload_file.sh -a http://localhost:8889 -t PN_EXTERNAL_LEGAL_FACTS_REPLICA -s SAVED  -c pn-cons-000  -f multa.pdf
# ./upload_file.sh -a http://localhost:8889 -t PN_AAR -s SAVED  -c pn-delivery-push  -f input
# ./upload_file.sh -a http://localhost:8889 -t PN_EXTERNAL_LEGAL_FACTS_REPLICA -c pn-cons-000 -f input
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
    -f, --file        Local file (mandatory)
    -s, --doc-status  Doc Status (default: PRELOADED)
    -p, --stage       Stage (default: dev)
    -t, --doc-type    Doc Type (mandatory)
    -c, --cx          (cx: default pn-delivery-001)
    -y, --content-type ContententType (default: application-pdf)
    -d, --download    Call download api
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
  doc_status=""
  api_endpoint=''
  cx='pn-delivery-001'
  doc_type=''
  file=''
  stage=''
  apiKey=''
  content_type='application/pdf'
  download=false


  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -v | --verbose) set -x ;;
    --no-color) NO_COLOR=1 ;;
    -f | --file) 
      file="${2-}"
      shift
      ;;
    -p | --stage) 
      stage="${2-}/"
      shift
      ;;
    -s | --doc-status) 
      doc_status="${2-}"
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
    -k | --api-key) 
      apiKey="${2-}"
      shift
      ;;
    -t | --doc-type) 
    doc_type="${2-}"
      shift
      ;;
    -y | --content-type) 
    content_type="${2-}"
      shift
      ;;
    -d | --download) 
      download=true
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

  # check required params and arguments
  [[ -z "${api_endpoint-}" ]] && die "Missing required parameter: api_endpoint"
  [[ -z "${file-}" ]] && die "Missing required parameter: file"
  [[ -z "${doc_type-}" ]] && die "Missing required parameter: doc-type"
#  [[ ${#args[@]} -eq 0 ]] && die "Missing script arguments"

  return 0
}

get_signed_uri(){
cat << EOF > ${TMPDIR}/signedreq.json
{
  "contentType": "${content_type}",
  "documentType": "${doc_type}",
  "status":"${doc_status}"
}
EOF

   sum=$(cat ${file}| openssl dgst -binary -sha256 | openssl base64 -A)
 
   TRACE="Root=1-63eb69b6-4a188176413f321b6f0c4006;Parent=0dd41322d48364ec;Sampled=1;Self=1-63eb69b6-6e47f78a785c1ca4099c139d" 

   resp=$(curl -v -s -H"X-Amzn-Trace-Id: $TRACE" -H"x-pagopa-safestorage-cx-id: ${cx}" -H"x-api-key: ${apiKey}" -H"content-type: application/json" -H"x-checksum: SHA-256" -H"x-checksum-value: ${sum}" -d@${TMPDIR}/signedreq.json -XPOST ${api_endpoint}/${stage}safe-storage/v1/files | tee /dev/tty )
  
  echo ""
  echo "-----------------"
   echo $resp | jq
   echo "-----------------"
   
   url=$(echo "${resp}" | jq -r '.uploadUrl')
   secret=$(echo "${resp}" | jq -r '.secret')
   key=$(echo "${resp}" | jq -r '.key')
  
}


dump_params(){
   echo  "Doc Type:  ${doc_type}"
   echo  "CX:        ${cx}"
   echo  "API Ep:    ${api_endpoint}"
   echo  "File:      ${file}"
   echo  "Status:    ${doc_status}"
}

# START SCRIPT

parse_params "$@"
setup_colors

dump_params

get_signed_uri

#echo URL:    ${url}
#echo Secret: ${secret}
#echo Key:    ${key}

echo Uploading files ${file}


curl -v -XPUT \
    -H"Content-type: ${content_type}" \
    -H"x-amz-checksum-sha256: ${sum}" \
   --upload-file ${file}  \
    -H"x-amz-meta-secret: ${secret}" \
       ${url}

echo "-----------------"
echo Key:    ${key}
echo sum256: ${sum}
echo "----------------- UPLOAD END"

if [ $download = true ]; then
  ./download.sh -a $api_endpoint -c ${cx} -k ${key}
fi