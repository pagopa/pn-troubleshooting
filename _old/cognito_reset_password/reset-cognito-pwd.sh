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
    Usage: $(basename "${BASH_SOURCE[0]}") [-h] [-v] [-p <aws-profile>] -r <aws-region> -x <new-password> -e <email> -c <cognito-user-pool>

    [-h]                      : this help message
    [-v]                      : verbose mode
    [-p <aws-profile>]        : aws cli profile (optional)
    -r <aws-region>           : aws region as eu-south-1
    -x <new-password>         : new password 
    -e <email>                : email of the cognito user
    -c <cognit-user-pool>     : cognito user pool
    
EOF
  exit 1
}

parse_params() {
  # default values of variables set from params
  aws_profile=""
  aws_region=""
  new_password=""
  email=""
  cognito_user_pool=""

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
    -x | --new-password) 
      new_password="${2-}"
      shift
      ;;
    -e | --email) 
      email="${2-}"
      shift
      ;;
    -c | --cognito-user-pool) 
      cognito_user_pool="${2-}"
      shift
      ;;
    -?*) die "Unknown option: $1" ;;
    *) break ;;
    esac
    shift
  done

  args=("$@")

  # check required params and arguments
  [[ -z "${email-}" ]] && usage 
  [[ -z "${new_password-}" ]] && usage
  [[ -z "${cognito_user_pool-}" ]] && usage
  return 0
}

dump_params(){
  echo ""
  echo "######      PARAMETERS      ######"
  echo "##################################"
  echo "AWS region:        ${aws_region}"
  echo "AWS profile:       ${aws_profile}"
  echo "New password:      ${new_password}"
  echo "Cognito user pool: ${cognito_user_pool}"
  echo "Email:             ${email}"
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

# retrieve email by username

username=$(aws ${aws_command_base_args} cognito-idp list-users --user-pool-id ${cognito_user_pool} --filter "email=\"${email}\"" | jq -r '.Users[0].Username')

if ( [ -z $username ] ) then
    echo "Username not found for email "${email}
    exit 1
fi

echo "Username found ${username}"

# update password
aws ${aws_command_base_args} \
    cognito-idp \
    admin-set-user-password \
    --user-pool-id ${cognito_user_pool} \
    --username ${username} \
    --password ${new_password}