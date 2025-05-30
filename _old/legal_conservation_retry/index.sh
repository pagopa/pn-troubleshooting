#!/usr/bin/env bash

et -Eeuo pipefail
trap cleanup SIGINT SIGTERM ERR EXIT

cleanup() {
  trap - SIGINT SIGTERM ERR EXIT
  # script cleanup here
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)


usage() {
      cat <<EOF
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] [-v] [-p <aws-profile>] -r <aws-region> -f <json-file> [-i <invoke>]

    [-h]                      : this help message
    [-v]                      : verbose mode
    [-p <aws-profile>]        : aws cli profile (optional)
    [-i <invoke>]             : invoke lambda?
    -r <aws-region>           : aws region as eu-south-1
    -f <json-file>            : json file
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  aws_profile=""
  aws_region=""
  invoke=false
  json_file=""

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -v | --verbose) set -x ;;
    -p | --profile) 
      aws_profile="${2-}"
      shift
      ;;
    -r | --region) 
      aws_region="${2-}"
      shift
      ;;
    -f | --json-file) 
      json_file="${2-}"
      shift
      ;;
    -i | --invoke) 
      invoke=true
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

  # check required params and arguments
  [[ -z "${json_file-}" ]] && usage 
  [[ -z "${aws_region-}" ]] && usage 
  [[ -z "${aws_profile-}" ]] && usage 
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "AWS region:        ${aws_region}"
  echo "AWS profile:       ${aws_profile}"
  echo "JSON file:         ${json_file}"
  echo "Invoke:            ${invoke}"
}


# START SCRIPT

parse_params "$@"
dump_params

echo ""
echo "=== Base AWS command parameters"
aws_command_base_args=""
if ( [ ! -z "${aws_profile}" ] ) then
  aws_command_base_args="${aws_command_base_args} --profile $aws_profile"
fi
if ( [ ! -z "${aws_region}" ] ) then
  aws_command_base_args="${aws_command_base_args} --region  $aws_region"
fi
echo ${aws_command_base_args}

retry_legal_conservation_request(){
    fileKey=$1

    echo "Query dynamodb using with key ${1}"

    document=$(aws ${aws_command_base_args} dynamodb get-item --table-name pn-SsDocumenti --key "{ \"documentKey\": { \"S\": \"${1}\" } }" )

    if ([ -z $document ]); then
        echo "Document ${1} not found"
    else
        echo "Document ${1} found"
        echo $document
        documentType=$(echo $document | jq -r '.Item.documentType.M.tipoDocumento.S')
        checksum=$(echo $document | jq -r '.Item.checkSum.S')
        contentType=$(echo $document | jq -r '.Item.contentType.S')
        clientShortCode=$(echo $document | jq -r '.Item.clientShortCode.S')
        escapedContenType=$(printf '%s\n' "$contentType" | sed -e 's/[\/&]/\\&/g')
        escapedChecksum=$(printf '%s\n' "$checksum" | sed -e 's/[\/&]/\\&/g')
        sed "s/KEY_PLACEHOLDER/${1}/; s/DOCUMENT_TYPE_PLACEHOLDER/${documentType}/; s/CONTENT_TYPE_PLACEHOLDER/${escapedContenType}/; s/CHECKSUM_PLACEHOLDER/${escapedChecksum}/; s/CLIENT_SHORT_CODE_PLACEHOLDER/${clientShortCode}/" tpl/event.json > ${1}.json

        echo "invoke "$invoke
        if ([ "$invoke" = true ]); then
            aws ${aws_command_base_args} lambda invoke --function-name pn-legalConservationStarter --invocation-type Event --cli-binary-format raw-in-base64-out --payload file://${1}.json ${1}-out.json
        fi
    fi
}

for i in $(jq -r '.documents' ${json_file} | jq -r '.[].fileKey'); 
    do retry_legal_conservation_request $i;
done