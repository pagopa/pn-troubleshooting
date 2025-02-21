#!/bin/bash

# <--- Variables ----

ENV="hotfix"

SRC_ACCOUNT_TYPE="confinfo"
SRC_BUCKET_NAME="pn-safestorage-eu-south-1-839620963891"
START_FILE_KEY="" # Optional. See '_copyng_mailing_receipts' function, last parameter.

DST_ACCOUNT_TYPE="confinfo"
DST_BUCKET_NAME="test-script-copy-mailing-recepits-eu-south-1-839620963891"

GLACIER_FILE_NAME="glacier_files.txt"
NOT_GLACIER_FILE_NAME="not_glacier_files.txt"

# Default values

    # _retrieve_files_from_glacier_tier
    EXPIRATION=1 # Default 30gg
    TIER=Bulk # Bulk|Standard|Expedited

# ---- Variables --->

# <--- Functions ----

function _print_help_message {
    cat << EOM

    Usage: 
    
    Open $0 with a text editor and set variables values;
    Exec the command:
    
        $0 <-r|-c|-h|--help>

    Where:
    -h|--help: Print this help message;
    -r: Retrive files from glacier tier;
    -c: Copy mailing receipt files from src to dest bucket. This command works across different
        AWS accounts but source and target env must be the same.

EOM
}

function _retrieve_files_from_glacier_tier {
    # Ref: https://github.com/pagopa/pn-troubleshooting/tree/main/retrieve_glacier_s3
    cd ../retrieve_glacier_s3 
    echo -e "\n ------> Retriving glacier document..."
    node ./index.js \
        --envName ${SRC_ENV} \
        --fileName ../copy_mailing_receipts/${GLACIER_FILE_NAME} \
        --expiration ${EXPIRATION} \
        --tier ${TIER}
    if [ $? -ne 0 ]
    then
        echo -e "\n ---> Error retriving glacier document. Exit code 1\n"
        exit 1
    fi    
}

function _copyng_mailing_receipts {
    echo -e "\n ------> Copying mailing receipts..."
    node index.js \
            --env $ENV \
            --srcAccountType $SRC_ACCOUNT_TYPE \
            --srcBucket $SRC_BUCKET_NAME \
            --dstAccountType $DST_ACCOUNT_TYPE \
            --dstBucket $DST_BUCKET_NAME \
            --fileName $NOT_GLACIER_FILE_NAME #--startFileKey $START_FILE_KEY
    if [ $? -ne 0 ]
    then
        echo -e "\n ---> Error copying mailing receipts. Exit code 2\n"
        exit 1
    fi
}

# ---- Functions --->

# <--- Script ----


case $1 in
"-r")
    _retrieve_files_from_glacier_tier
    ;;
"-c")
    _copyng_mailing_receipts
    ;;
*)
    _print_help_message
    ;;
esac

# ---- Script --->
