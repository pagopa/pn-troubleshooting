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
echo "### BEFORE PROCEEDING, DEPLOY FE COURTESY PAGES ON PORTALS ###"
echo "################################################################################"
echo
echo


read -p "Do you really want to proceed to stop services on the account $aws_profile? <y/N> " prompt
if [[ $prompt == "y" || $prompt == "Y" || $prompt == "yes" || $prompt == "Yes" ]]
   then
    echo "FIRST STEP = > LAMBDA SET CONCURRENT EXECUTION TO ZERO" && sleep 3; 
        #Stop Lambda section
        echo "For multiselection press TAB on each lambda in the list" && sleep 5

        # Get Lambda List
        lambdas=$(aws ${aws_command_base_args} lambda list-functions  | jq -r '.Functions[] | .FunctionName ' )

        # Execute multiselection
        selection=$(echo "$lambdas" | fzf -m)

        # Stop all selected Lambda
        for lambda in $selection; do
        aws ${aws_command_base_args} lambda put-function-concurrency --reserved-concurrent-executions 0 --function-name "$lambda"  && echo "The lambda $lambda was stopped"  >> output/output_shutdown_lambda.log ;
        done
        echo "All Lambdas are been stopped check the output log"
    
    echo "SECOND STEP = > SET DESIRE COUNT TO ZERO IN ALL MICROSERVICE IN A CLUSTER" && sleep 3;
        #Stop Microservice section
        echo "For multiselection press TAB on each cluster in the list" && sleep 5

        # Get Cluster ECS list
        cluster=$(aws ${aws_command_base_args} ecs list-clusters --output text  | awk '{print $2}' | cut -d "/" -f 2)

        # Execute multiselection
        selection_c=$(echo "$cluster" | fzf -m)

        # Stop all microservices within the selected ECS clusters
        for cluster in $selection_c; do
        aws ${aws_command_base_args} ecs list-services --cluster $cluster  --output text  | awk '{print $2}'  | cut -d "/" -f 3 | while read -r service; do aws ${aws_command_base_args} ecs update-service --cluster $cluster  --service $service --desired-count 0 >> output/output_shutdown_ecs.log; done ; echo "All microservices of the $cluster are stopped, check the output"
        done
    else
      exit 0
fi   