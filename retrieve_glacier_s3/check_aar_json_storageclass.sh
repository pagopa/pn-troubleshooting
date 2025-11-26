#!/bin/bash

if [ $# -eq 0 ] || [ "$1" == '-h' ] || [ "$1" == '--help' ]; then
    cat << "    EOF"
    
    ------------------------------------ Help -----------------------------------

    This script verifies the storageClass associated with the filekeys in the
    bucket pn-safestorage***. The full bucket name will be constructed based
    on the AWS profile provided as input to the script.
    
    Usage: ./check_aar_json_storageclass.sh <aar.json> <AWS profile> 

    Note: 
    1. When a file is retrieved from Glacier tier its storageClass does not change
    2. 'aar.json' from 'retrieve_attachments_from_iun'

    -----------------------------------------------------------------------------

    EOF
    exit 0
fi 

AAR_FILE=$1
PROFILE=$2

# cat aar.json
#<IUN>,<FILEKEY>
# ...

# Delete file if exists
[ -f to_retrieve_$AAR_FILE ] && > to_retrieve_$AAR_FILE 

echo -e "\n ------------------------------------------------------------"
echo "                 FILEKEY                     | STORAGECLASS  "
echo " ------------------------------------------------------------"

BUCKET=$(aws s3api list-buckets --profile sso_pn-confinfo-prod | jq -r '.Buckets[].Name |
    select(.| match("pn-safestorage") && ! match("staging"))')

while read ROW
do
    FILEKEY=$(echo $ROW | awk 'BEGIN{FS=","}{print $2}')
    STORAGE_CLASS=$(aws s3api get-object-attributes --bucket $BUCKET \
        --key $FILEKEY \
        --object-attributes "StorageClass" \
        --profile $PROFILE | jq -r '.Buckets[].Name | select(. | match("pn-safestorage"))' | grep -v staging )
    #{
    #  "LastModified": "<timestamp>",
    #  "VersionId": "<VersionId>",
    #  "StorageClass": "<GLACIER|STANDARD>"
    #}
    if [ "$STORAGE_CLASS" == "GLACIER" ]; then
        echo $ROW >> to_retrieve_$AAR_FILE
    fi
    echo " $FILEKEY |   $STORAGE_CLASS "
    
done < $AAR_FILE
echo -e " ------------------------------------------------------------\n"

if [ -f to_retrieve_$AAR_FILE ]; then
    echo -e "Glacier filekeys available into the file \"to_retrieve_${AAR_FILE}\".\n"
fi
