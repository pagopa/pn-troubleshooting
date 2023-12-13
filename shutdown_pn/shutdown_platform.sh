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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] [-v] [-p <aws-profile>] -r <aws-region>
    [-h]                      : this help message
    [-v]                      : verbose mode
    [-p <aws-profile>]        : aws cli profile (optional)
    -r <aws-region>           : aws region as eu-south-1
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  project_name=pn
  work_dir=$HOME/tmp/deploy
  aws_profile=""
  aws_region=""
  env_type=""

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
    -w | --work-dir) 
      work_dir="${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

  # check required params and arguments
  [[ -z "${aws_region-}" ]] && usage
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "Project Name:       ${project_name}"
  echo "Work directory:     ${work_dir}"
  echo "AWS region:         ${aws_region}"
  echo "AWS profile:        ${aws_profile}"
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

echo
echo
echo "################################################################################"
echo "### PRIMA DI PROCEDERE DEPLOYARE IL FE PER LE PAGINE DI CORTESIA SUI PORTALI ###"
echo "################################################################################"
echo
echo


read -p "Vuoi veramente procedere allo stop dei servizi sull'account $aws_profile? <y/N> " prompt
if [[ $prompt == "y" || $prompt == "Y" || $prompt == "yes" || $prompt == "Yes" ]]
   then
    echo "FIRST STEP = > LAMBDA SET CONCURRENT EXECUTION TO ZERO" && sleep 3; 
        #STOP LAMBDA:
        echo "per una sola lambda premi invio su quella selezionata, per la multiselection utlizzare TAB e successivamente INVIO" && sleep 5

        # Ottieni l'elenco delle Lambda
        lambdas=$(aws ${aws_command_base_args} lambda list-functions  | jq -r '.Functions[] | .FunctionName ' )

        # Esegui la multiselection
        selection=$(echo "$lambdas" | fzf -m)

        # Ferma le Lambda selezionate
        for lambda in $selection; do
        aws ${aws_command_base_args} lambda put-function-concurrency --reserved-concurrent-executions 0 --function-name "$lambda"  && echo "la lambda $lambda e' stata arrestata"  >> output/output_shutdown_lambda.log ;
        done
        echo "Le lambda sono state arrestate vedi log di output"
    
    echo "SECOND STEP = > SET DESIRE COUNT TO ZERO IN ALL MICROSERVICE IN A CLUSTER" && sleep 3;
        #STOP MICROSERVICE:
        echo "per un solo cluster premi invio su quello selezionato, per la multiselection utlizzare TAB e successivamente INVIO" && sleep 5

        # Ottieni l'elenco dei cluster ECS
        cluster=$(aws ${aws_command_base_args} ecs list-clusters --output text  | awk '{print $2}' | cut -d "/" -f 2)

        # Esegui la multiselection
        selection_c=$(echo "$cluster" | fzf -m)

        # Ferma tutti i microservizi all'interno dei cluster ECS selezionati
        for cluster in $selection_c; do
        aws ${aws_command_base_args} ecs list-services --cluster $cluster  --output text  | awk '{print $2}'  | cut -d "/" -f 3 | while read -r service; do aws ${aws_command_base_args} ecs update-service --cluster $cluster  --service $service --desired-count 0 >> output/output_shutdown_ecs.log; done ; echo "i microservizi del cluster $cluster sono stati fermati, vedi log di output"
        done
    else
      exit 0
fi   