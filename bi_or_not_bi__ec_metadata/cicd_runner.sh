#! /bin/bash -e

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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] --account-type <account-type> --env-type <env-type> --export-bucket-name <export-bucket-name> --logs-bucket-name <logs-bucket-name> --resource-root <resource-root>

    [-h]                                       : this help message
    --account-type <account-type>              : "confinfo" or "core"
    --env-type <env-type>                      : "dev", "test", "uat", "hotfix", "prod"
    --export-bucket-name <export-bucket-name>  : Bucket where dump are present
    --logs-bucket-name                         : Bucket where cdc are written
    --resource-root                            : base path where resources are present
    --core-bucket-name                         : core bucket name
    --confinfo-bucket-name                     : confinfo bucket name

EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  account_type=""
  env_type=""
  export_bucket_name=""
  logs_bucket_name=""
  resource_root=""
  core_bucket_name=""
  confinfo_bucket_name=""
  
  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    --account-type) 
      account_type="${2-}"
      shift
      ;;
    --env-type) 
      env_type="${2-}"
      shift
      ;;
    --export-bucket-name) 
      export_bucket_name="${2-}"
      shift
      ;;
    --logs-bucket-name) 
      logs_bucket_name="${2-}"
      shift
      ;;
    --resource-root)
      resource_root="${2-}"
      shift
      ;;
    --core-bucket-name)
      core_bucket_name="${2-}"
      shift
      ;;
    --confinfo-bucket-name)
      confinfo_bucket_name="${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

  # check required params and arguments
  [[ -z "${account_type-}" ]] && usage 
  [[ -z "${env_type-}" ]] && usage
  [[ -z "${export_bucket_name-}" ]] && usage
  [[ -z "${logs_bucket_name-}" ]] && usage
  [[ -z "${resource_root-}" ]] && usage
  [[ -z "${core_bucket_name-}" ]] && usage
  [[ -z "${confinfo_bucket_name-}" ]] && usage
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "Account Type:                ${account_type}"
  echo "Environment Type:            ${env_type}"
  echo "Dynamo Exports Bucket Name:  ${export_bucket_name}"
  echo "Cdc Bucket Name:             ${logs_bucket_name}"
  echo "Resource Root:               ${resource_root}"
  echo "Core Bucket Name:            ${core_bucket_name}"
  echo "Confinfo Bucket Name:        ${confinfo_bucket_name}"
}


# START SCRIPT

parse_params "$@"
dump_params


if ([ $account_type == "confinfo" ]); then
                    
  COMMANDLINE=" --dynexp-indexed-data-folder ./out/indexing/dynExp \
    dynamoExportsIndexing \
      --aws-bucket ${export_bucket_name} \
      --aws-dynexport-folder-prefix %s/incremental2024/ \
      --result-upload-url s3://${export_bucket_name}/parquet/ \
      pn-EcRichiesteMetadati 2023-6-1 3035-1-1 \
    \
    \
    dynamoExportsIndexing \
      --aws-bucket ${export_bucket_name} \
      --aws-dynexport-folder-prefix %s/incremental2024/ \
      --result-upload-url s3://${export_bucket_name}/parquet/ \
      pn-SsDocumenti 2023-6-1 3035-1-1 "
    

  export MAVEN_OPTS="-Xmx8g \
    --add-opens java.base/sun.nio.ch=ALL-UNNAMED \
    --add-opens java.base/sun.security.action=ALL-UNNAMED \
    --add-opens java.base/sun.util.calendar=ALL-UNNAMED"

  ARGUMENTS=$( echo $COMMANDLINE | sed -e 's/  */,/g' )
  ./mvnw compile
  ./mvnw exec:java "-Dexec.arguments=${ARGUMENTS}"

elif ([ $account_type == "core" ]); then
  
  if ([ $env_type == "prod" ]); then
    COMMANDLINE=" --cdc-indexed-data-folder ./out/prove_dev/cdc \
      cdcIndexing \
        --aws-bucket ${logs_bucket_name} \
        --result-upload-url s3://${export_bucket_name}/parquet/ \
        pn-Notifications 2023-06-1 2023-12-1 \
      jsonTransform --flags LENIENT + fixSourceChannelDetails \
      cdcIndexing \
        --aws-bucket ${logs_bucket_name} \
        --result-upload-url s3://${export_bucket_name}/parquet/ \
        pn-Notifications 2023-12-1 2024-1-5 \
      jsonTransform - fixSourceChannelDetails \
      cdcIndexing \
        --aws-bucket ${logs_bucket_name} \
        --result-upload-url s3://${export_bucket_name}/parquet/ \
        pn-Notifications 2024-1-5 3055-1-1 \
      \
      \
      \
      jsonTransform + fixGeoKey \
      cdcIndexing \
        --aws-bucket ${logs_bucket_name} \
        --result-upload-url s3://${export_bucket_name}/parquet/ \
        pn-Timelines 2023-6-1 2023-9-21 \
      jsonTransform - fixGeoKey \
      cdcIndexing \
        --aws-bucket ${logs_bucket_name} \
        --result-upload-url s3://${export_bucket_name}/parquet/ \
        pn-Timelines 2023-9-21 3055-1-1 \
      \
      \
      \
      dynamoExportsIndexing \
      --aws-bucket ${export_bucket_name} \
      --aws-dynexport-folder-prefix %s/incremental2024/ \
      --result-upload-url s3://${export_bucket_name}/parquet/ \
      pn-PaperRequestError 2023-6-1 3035-1-1 \
      \
      \
      \
      taskDagExecutor \
        --report ${resource_root}/analog-delivery-monitoring/reports/ShipperReliabilityReport.json \
        --source-path ${resource_root} \
        --export-bucket ${export_bucket_name} \
      \
      \
      \
      taskDagExecutor \
        --report ${resource_root}/analog-delivery-monitoring/reports/SlaReport.json \
        --source-path ${resource_root} \
        --export-bucket ${export_bucket_name}
      "
  else
    COMMANDLINE=" --cdc-indexed-data-folder ./out/prove_dev/cdc \
      cdcIndexing \
        --aws-bucket ${logs_bucket_name} \
        --result-upload-url s3://${export_bucket_name}/parquet/ \
        pn-Notifications 2024-1-1 3055-1-1 \
      \
      \
      \
      cdcIndexing \
        --aws-bucket ${logs_bucket_name} \
        --result-upload-url s3://${export_bucket_name}/parquet/ \
        pn-Timelines 2024-1-1 3055-1-1 \
      \
      \
      \
      dynamoExportsIndexing \
        --aws-bucket ${export_bucket_name} \
        --aws-dynexport-folder-prefix %s/incremental2024/ \
        --result-upload-url s3://${export_bucket_name}/parquet/ \
        pn-PaperRequestError 2024-1-1 3035-1-1 \
      \
      \
      \
      taskDagExecutor \
        --report ${resource_root}/analog-delivery-monitoring/reports/ShipperReliabilityReport.json \
        --source-path ${resource_root} \
        --export-bucket ${export_bucket_name} \
      \
      \
      \
      taskDagExecutor \
        --report ${resource_root}/analog-delivery-monitoring/reports/SlaReport.json \
        --source-path ${resource_root} \
        --export-bucket ${export_bucket_name}
      "
  fi

  export MAVEN_OPTS="-Xmx8g \
    --add-opens java.base/sun.nio.ch=ALL-UNNAMED \
    --add-opens java.base/sun.security.action=ALL-UNNAMED \
    --add-opens java.base/sun.util.calendar=ALL-UNNAMED"

  ARGUMENTS=$( echo $COMMANDLINE | sed -e 's/  */,/g' )
  ./mvnw compile
  ./mvnw exec:java -Dexec.arguments=${ARGUMENTS} -DCORE_BUCKET=${core_bucket_name} -DCONFINFO_BUCKET=${confinfo_bucket_name}

fi

