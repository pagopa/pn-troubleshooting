#!/bin/bash

# --------- Variables ---------

# - Miscellaneous
WORKDIR="/path/to/github/pn-troubleshooting"
ENV=""
ACCOUNT_TYPE=""

PROFILE="sso_pn-${ACCOUNT_TYPE}-${ENV}"

# - Input/Ouptut files 

IUN_LIST_FILE=iuns.txt # IUN List
TIMEL4IUN="timelines_from_iun.json" # Timelines
OK_IUN="public_registry_call.json" # Iun, timestamp and last timelineElementId if category == "PUBLIC_REGISTRY_CALL"
NOT_OK_IUN="not_public_registry_call.json" # complete timeline if category != "PUBLIC_REGISTRY_CALL"

# --------- Functions ---------

function _aws_sso_login {
        AWS_PROFILE=$1
        aws sts get-caller-identity --profile $AWS_PROFILE >> /dev/null 2>&1
        if [ "$?" -ne 0 ]
        then
                echo " -> Logging in aws via sso"
                aws sso login --profile $AWS_PROFILE
                echo " -> Done."
        else
                echo " -> User already logged with profile $AWS_PROFILE"
        fi
}

function _timelines_from_iuns { 

    IN_FILE=$1 # .txt
    OUT_FILE=$2 # .json

    cd ${WORKDIR}/timelines_from_iuns

    IS_UBUNTU_RELEASE=$(grep -i 'name="ubuntu"' /etc/os-release)
    if [ -n $IS_UBUNTU_RELEASE ]
    then
        PACKAGE=$(dpkg -l \*venv\* | grep -oP "python\d\.\d{1,2}-venv")
        if [ -z "$PACKAGE" ]
        then 
            echo -e "\nTo create a python virtual environment 'Python3.x-venv' package must be installed. Exit\n"
            exit 0
        fi
    fi

    # Configurazione environment python
    python3 -m venv venv 
    source venv/bin/activate
    pip install -r requirements.txt

    # Esecuzione script python
    python3 ./timelines_from_iuns.py ../retrieve_logs_from_athena/$IN_FILE \
        ../retrieve_logs_from_athena/$OUT_FILE --profile $PROFILE
   
    # Ritorno al path precedente
    cd -
}

function _obtain_timestamp_and_timelineElementId {

    IN_FILE=$1

    jq -c '.[] | select( .timeline[-1].category | contains("PUBLIC_REGISTRY_CALL")) | {iun:.iun,timestamp: .timeline[-1].timestamp,timelineElementId: .timeline[-1].timelineElementId}' $IN_FILE >> $OK_IUN

    jq -c '.[] | select( .timeline[-1].category | contains("PUBLIC_REGISTRY_CALL") | not)' \
        $IN_FILE >> $NOT_OK_IUN
}

# --------- Script ---------

cd ${WORKDIR}/retrieve_logs_from_athena

_aws_sso_login $PROFILE

_timelines_from_iuns $IUN_LIST_FILE $TIMEL4IUN

_obtain_timestamp_and_timelineElementId $TIMEL4IUN $OK_IUN

#---------------------------