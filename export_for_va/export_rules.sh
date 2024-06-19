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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] -p <aws-profile> -r <aws-region>
    [-h]                      : this help message
    -p <aws-profile>          : aws-profile
    -r <aws-region>           : aws-region
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  work_dir=$HOME
  aws_profile=""

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -p | --profile) 
      aws_profile="${2-}"
      shift
      ;;
    -r | --region) 
      aws_region="${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

   # check required params and arguments
  [[ -z "${aws_profile-}" ]] && usage 
  [[ -z "${aws_region-}" ]] && usage
  
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "AWS Profile:        ${aws_profile}"
  echo "Aws Regione:        ${aws_region}"
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

echo "STARTING EXECUTION"

echo "create output directory if not exist"

output_dir=./output/rules_$(date +%Y%m%d)_$aws_profile

mkdir -p $output_dir

cd $output_dir

echo "### WAF RULE ###"

output_file="web_acl_rules_output.csv"

echo "Acl, Rules, Associated AWS Resources" > "$output_file"

# WebAcl List
web_acl_list=$(aws ${aws_command_base_args} wafv2 list-web-acls --scope REGIONAL --output json | jq -r '.WebACLs[] | "\(.Name),\(.Id),\(.ARN)"')

while IFS=',' read -r name id arn; do
    echo "Processing Web ACL: $name ($id)"

    # WebAcl Details
    web_acl_details=$(aws ${aws_command_base_args} wafv2 get-web-acl --id "$id" --name "$name" --scope REGIONAL)

    # Extract Name
    rule_names=$(echo "$web_acl_details" | jq -r '.WebACL.Rules[].Name' | paste -sd "," -)

    if [[ "$arn" == *"Spid"* ]]; then
        # Special Case spid
        resources=$(aws ${aws_command_base_args} wafv2 list-resources-for-web-acl --web-acl-arn "$arn" --output json --resource-type APPLICATION_LOAD_BALANCER | jq -r '.ResourceArns[]')
        
        resource_names=$(echo "$resources" | paste -sd "," -)
    else
        #  Generic Case
        resources=$(aws ${aws_command_base_args} wafv2 list-resources-for-web-acl --web-acl-arn "$arn" --output json --resource-type API_GATEWAY | jq -r '.ResourceArns[]')

        resource_names=""

        # Obtain Name of Resources
        for resource_arn in $resources; do
            # Extract ApiId from ARN
            api_id=$(echo "$resource_arn" | awk -F'/' '{print $3}')

            # Obtian Name of Api by ApiId
            api_name=$(aws ${aws_command_base_args} apigateway get-rest-api --rest-api-id "$api_id" --output json | jq -r '.name')

            # Prepare string for file
            resource_names+="$(echo "$api_name" | paste -sd "," -), "
        done

        # Prepare string for file
        resource_names=$(echo "$resource_names" | sed 's/, $//')
    fi

    # Row to CSV
    acl_row="$name, $rule_names, $resource_names"

    # Add row to CSV
    echo "$acl_row" >> "$output_file"

done <<< "$web_acl_list"

echo "File CSV creato: $output_file"

echo "### API GW ###"

# Obtain api domainn
apidomains=$(aws ${aws_command_base_args} apigateway get-domain-names --output json | jq -r '.items[].domainName')

csv_file="api-gw_mappings_output.csv"
touch "$csv_file"

echo "Api Domains,API Mappings,Security Policy" > "$csv_file"

for apidomain in $apidomains; do

  # Obtain ApiId and securityPolicy
  api_mappings=$(aws ${aws_command_base_args} apigatewayv2 get-api-mappings --domain-name $apidomain --output json | jq -r '.Items[].ApiId')
  security_policy=$(aws ${aws_command_base_args} apigateway get-domain-name --domain-name $apidomain --output json | jq -r '.securityPolicy')

  api_mappings_csv=""
  for apiid in $api_mappings; do
    # Obtain name by ApiID
    api_name=$(aws ${aws_command_base_args} apigateway get-rest-api --rest-api-id $apiid --output json | jq -r '.name')

    # Add name of Api in the list
    if [ ! -z "$api_mappings_csv" ]; then
      api_mappings_csv="$api_mappings_csv;$api_name"
    else
      api_mappings_csv="$api_name"
    fi
  done

  # Prepare CSV
  riga_csv="$apidomain,$api_mappings_csv,$security_policy"

  # Add Row to CSV
  echo "$riga_csv" >> "$csv_file"

done

echo "File CSV creato: $csv_file"

echo "### LOAD BALANCER ###"

output2_file="load_balancer_output.csv"

echo "Load Balancer,Listener Port,Protocol,Default Action,Forward to Target Group" > "$output2_file"

# List of Load Balancer
load_balancers=$(aws ${aws_command_base_args} elbv2 describe-load-balancers --query 'LoadBalancers[*].[LoadBalancerName]' --output text)

for lb_name in $load_balancers; do
    # Obtain ARN for all Load-Balancer
    lb_arn=$(aws ${aws_command_base_args} elbv2 describe-load-balancers --names "$lb_name" --query 'LoadBalancers[*].[LoadBalancerArn]' --output text)
    
    # Obtain Scheme for each Load-Balancer
    lb_scheme=$(aws ${aws_command_base_args} elbv2 describe-load-balancers --load-balancer-arn "$lb_arn" --query 'LoadBalancers[*].[Scheme]' --output text)
    
    # Obtain Listners for each Load Balancer
    listeners=$(aws ${aws_command_base_args} elbv2 describe-listeners --load-balancer-arn "$lb_arn" --query 'Listeners[*].[Port,Protocol,DefaultActions[0].Type,DefaultActions[0].TargetGroupArn]' --output text)
    
    while read -r listener; do
        port=$(echo "$listener" | awk '{print $1}')
        protocol=$(echo "$listener" | awk '{print $2}')
        default_action=$(echo "$listener" | awk '{print $3}')
        target_group_arn=$(echo "$listener" | awk '{print $4}')
        target_group_name="None"

        # Check if ARN is not null
        if [ "$target_group_arn" != "None" ]; then
            # Obtain Name of target group by ARN
            target_group_name=$(aws ${aws_command_base_args} elbv2 describe-target-groups --target-group-arns "$target_group_arn" --query 'TargetGroups[*].[TargetGroupName]' --output text)
        fi
         
        # Prepare CSV
        echo "$lb_name,$port,$protocol,$default_action,$target_group_name,$lb_scheme" >> "$output2_file"
    done <<< "$listeners"
done

echo "CSV creato con successo: $output2_file"

echo "### SECURITY GROUP ###"

output3_file="security_groups_output.csv"

# Describe Security Group 
describe_security_groups() {
    aws ${aws_command_base_args} ec2 describe-security-groups --query 'SecurityGroups[*].{ID:GroupId,Name:GroupName,Description:Description,VPC:VpcId,Inbound:IpPermissions,Outbound:IpPermissionsEgress}' --output json
}

format_and_print_security_groups() {
    security_groups=$(describe_security_groups)
    echo "Security Group ID,Name,Description,VPC ID,Direction,Protocol,From Port,To Port,Source/Destination" > "$output3_file"

    # Prepare CSV
    echo "$security_groups" | jq -r '.[] | 
        . as $sg |
        ($sg.Inbound[]? | 
            "\($sg.ID),\($sg.Name),\($sg.Description),\($sg.VPC),INBOUND,\(.IpProtocol),\(.FromPort // "N/A"),\(.ToPort // "N/A"),\(.IpRanges[]?.CidrIp // "N/A" | select(. != null)),\(.Ipv6Ranges[]?.CidrIpv6 // "N/A" | select(. != null)),\(.UserIdGroupPairs[]?.GroupId // "N/A" | select(. != null))"
        ),
        ($sg.Outbound[]? | 
            "\($sg.ID),\($sg.Name),\($sg.Description),\($sg.VPC),OUTBOUND,\(.IpProtocol),\(.FromPort // "N/A"),\(.ToPort // "N/A"),\(.IpRanges[]?.CidrIp // "N/A" | select(. != null)),\(.Ipv6Ranges[]?.CidrIpv6 // "N/A" | select(. != null)),\(.UserIdGroupPairs[]?.GroupId // "N/A" | select(. != null))"
        )' | while read -r line; do
            echo "$line" >> "$output3_file"
    done
}

# Execute Fuction
format_and_print_security_groups

echo "CSV creato con successo: $output3_file"

echo "### SCRIPT DONE ###"