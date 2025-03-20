#!/bin/bash

AWS_PROFILE="$1"

# -------------------------------------------

function _aws_sso_login {
		AWS_PROFILE="$1"
        aws sts get-caller-identity --profile $AWS_PROFILE >> /dev/null 2>&1
        if [ "$?" -ne 0 ]
        then
                echo -e "\n -> Logging in aws via sso"
                aws sso login --profile $AWS_PROFILE
                echo " -> Done."
        else
                echo -e "\n -> User already logged with profile $AWS_PROFILE"
        fi
}

function _retrieve_ssm_parameter {
	echo ""
	PARAMETERS_PREFIX="$1"
	for N in {1..5}
	do
		NAME=${PARAMETERS_PREFIX}-${N}
		echo " -> Retrieving parameter ${NAME}..."
		aws ssm get-parameters \
			--name $NAME \
			--output json \
			--profile $AWS_PROFILE | jq '.Parameters[].Value | fromjson ' >> "${NAME}##A##.json"
	done
	echo -e " -> Done.\n"
}

# -------------------------------------------

_aws_sso_login $AWS_PROFILE
_retrieve_ssm_parameter "radd-experimentation-zip"

