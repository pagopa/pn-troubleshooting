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

echo "create output directory if not exist"

mkdir -p output

read -p "Do you really want to proceed to start services on the account $aws_profile? <y/N> " prompt
if [[ $prompt == "y" || $prompt == "Y" || $prompt == "yes" || $prompt == "Yes" ]]
   then
    echo "FIRST STEP = > REMOVE THROTTLING ON LAMBDA" && sleep 3; 
        #Start Lambda section
        echo "For multiselection press TAB on each lambda in the list" && sleep 5

        # Get Lambda List
        lambdas=$(aws ${aws_command_base_args} lambda list-functions  | jq -r '.Functions[] | .FunctionName ' )

        # Execute multiselection
        selection=$(echo "$lambdas" | fzf -m)

        # Remove throttling in all selected Lambda
        for lambda in $selection; do
        aws ${aws_command_base_args} lambda delete-function-concurrency  --function-name "$lambda"  && echo "The function-concurrency on $lambda was deleted"  >> output/output_startup_lambda.log ;
        done
        echo "All function-concurrency are been removed check the output log"
    
    echo "SECOND STEP = > SET DESIRE COUNT TO THE MINIUM DESIRE TASK IN ALL MICROSERVICE IN A CLUSTER" && sleep 3;
        #Start Microservice section
        echo "For multiselection press TAB on each cluster in the list" && sleep 5

        # Get Cluster ECS list
        cluster=$(aws ${aws_command_base_args} ecs list-clusters --output text  | awk '{print $2}' | cut -d "/" -f 2)

        # Execute multiselection
        selection_c=$(echo "$cluster" | fzf -m)

        # Start all microservices within the selected ECS clusters
        for cluster in $selection_c; do
           aws ${aws_command_base_args} ecs list-services --cluster $cluster  --output text  | awk '{print $2}'  | cut -d ":" -f 6 | while read -r service; 
              do aws ${aws_command_base_args} application-autoscaling describe-scalable-targets --service-namespace ecs --resource-ids $service  |  jq -r '.ScalableTargets[].MinCapacity // "empty"' | while read -r mintasks; do
                 #if scalable-targets isn't present, set desire count to 1
                 if [ "$mintasks" = "empty" ] ; then
                 aws ${aws_command_base_args} ecs update-service --cluster $cluster  --service $(echo "$service" | cut -d "/" -f 3) --desired-count 1  >> output/output_startup_ecs.log ; 
                 #else set desire count like minium number of task
                 else
                 aws ${aws_command_base_args} ecs update-service --cluster $cluster  --service $(echo "$service" | cut -d "/" -f 3) --desired-count $mintasks >> output/output_startup_ecs.log; 
                 fi
                 done; 
              done; 
        echo "Desire tasks for all microservices of the $cluster are been set like minium task number, check the output"
        done
    else
      exit 0
fi   