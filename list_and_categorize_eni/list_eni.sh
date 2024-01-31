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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] [-v]  [-p <aws-profile-core>]  [-c <aws-profile-confinfo>] [-e <pn-env>] -r <aws-region>
    [-h]                           : this help message
    [-v]                           : verbose mode
    [-p <aws-profile-core>]        : aws cli profile core
    [-c <aws-profile-confinfo>]    : aws cli profile confinfo
    [-e <pn-env>]                  : pn environment (es. hotfix, prod ecc..)
    -r <aws-region>                : aws region as eu-south-1

    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  project_name=pn
  work_dir=$HOME/tmp/deploy
  aws_profile_core=""
  aws_profile_confinfo=""
  env_type=""
  aws_region="eu-south-1"

  while :; do
    case "${1-}" in
    -h | --help) usage ;;
    -v | --verbose) set -x ;;
    -p | --profile-core) 
      aws_profile_core="${2-}"
      shift
      ;;
    -c | --profile-confinfo) 
      aws_profile_confinfo="${2-}"
      shift
      ;;
    -w | --work-dir) 
      work_dir="${2-}"
      shift
      ;;
    -e | --pn-env) 
      pn_env="${2-}"
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
  [[ -z "${pn_env-}" ]] && usage
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "Project Name:             ${project_name}"
  echo "Work directory:           ${work_dir}"
  echo "AWS profile core:         ${aws_profile_core}"
  echo "AWS profile confinfo:     ${aws_profile_confinfo}"
  echo "AWS region:               ${aws_region}"
  echo "PN Env:                   ${pn_env}"
}
# START SCRIPT

parse_params "$@"
dump_params


echo ""
echo "=== Base AWS command parameters"
aws_command_base_args_core=""
if ( [ ! -z "${aws_profile_core}" ] ) then
  aws_command_base_args_core="${aws_command_base_args_core} --profile $aws_profile_core"
fi
if ( [ ! -z "${aws_region}" ] ) then
  aws_command_base_args_core="${aws_command_base_args_core} --region  $aws_region"
fi
echo ${aws_command_base_args_core}

aws_command_base_args_confinfo=""
if ( [ ! -z "${aws_profile_confinfo}" ] ) then
  aws_command_base_args_confinfo="${aws_command_base_args_confinfo} --profile $aws_profile_confinfo"
fi
if ( [ ! -z "${aws_region}" ] ) then
  aws_command_base_args_confinfo="${aws_command_base_args_confinfo} --region  $aws_region"
fi
echo ${aws_command_base_args_confinfo}

metadata_file="metadata-$pn_env.json"
output_file="ip_classification-$pn_env.txt"

echo "List current IPs"
 aws ${aws_command_base_args_confinfo}\
     ec2 describe-network-interfaces \
     --no-paginate \
   | jq '.NetworkInterfaces | .[] ' \
   | jq ' { "account":"confinfo", "grpId": .Groups[0].GroupId, "grpName": .Groups[0].GroupName, "desc": .Description, "az": .AvailabilityZone,  "privIp": .PrivateIpAddress, "pubIp": .Association.PublicIp }' \
   | jq -r '. | tojson' | sort > confinfo.log


 aws ${aws_command_base_args_core}\
     ec2 describe-network-interfaces \
     --no-paginate \
   | jq '.NetworkInterfaces | .[] ' \
   | jq ' { "account":"core", "grpId": .Groups[0].GroupId, "grpName": .Groups[0].GroupName, "desc": .Description, "az": .AvailabilityZone,  "privIp": .PrivateIpAddress, "pubIp": .Association.PublicIp }' \
   | jq -r '. | tojson' | sort > core.log


metadata_length=$( cat ${metadata_file} | jq -r '. | length' )
echo "Number of ip classifications ${metadata_length}"
echo "" > $output_file

for idx in $(seq 0 $[ $metadata_length -1 ]); do 
  echo ""
  echo ""
  echo "Metadata number $idx"
  metadata=$( cat ${metadata_file} | jq -r ".[$idx] | tojson" )
  echo "  $metadata"
  
  account=$( echo $metadata | jq -r ' .account' )
  title=$( echo $metadata | jq -r ' .title' )
  regexp=$( echo $metadata | jq -r ' .regexp' )
  regexpOn=$( echo $metadata | jq -r ' .regexpOn' )
  echo "  IP Category \"${account}::${title}\" regexp \"$regexp\" on \"$regexpOn\""
  
  input_file="${account}.log"
  echo "  Private IPs"
  privateIPs=$( \
      jq '. | select( .'$regexpOn' and (.'$regexpOn' | match("'"$regexp"'")) ) | { "line": (.privIp + "     " + .az + "  " + .'$regexpOn') }' ${input_file} \
         \
    )
  echo $privateIPs

  echo "  Public IPs"
  publicIPs=$( \
      jq -r '. | select( .pubIp and .'$regexpOn' and (.'$regexpOn' | match("'"$regexp"'")) ) | { "line": (.pubIp + "     " + .az + "  " + .'$regexpOn') }' ${input_file} \
      \
    )
  echo $publicIPs
  

  if ( [ "" != "$privateIPs"  -o  "" != "$publicIPs" ] ) then
    
    echo "$account ------- $title" >> $output_file
    
    if ( [ "" != "$privateIPs" ] ) then
      echo "  Private IPs" >> $output_file
      echo $privateIPs | jq -r '.[] | "  " + .' >> $output_file
    fi
    if ( [ "" != "$publicIPs" ] ) then
      echo "  Public IPs" >> $output_file
      echo $publicIPs | jq -r '.[] | "  " + .' >> $output_file
    fi
    
    echo "" >> $output_file
    echo "" >> $output_file
  
  #else
    #echo "EXCLUDED $account ------- $title" >> $output_file
  fi
  
done

