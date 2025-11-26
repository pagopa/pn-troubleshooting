#!/bin/bash

if [ $# -eq 0 ] || [ "$1" == '-h' ] || [ "$1" == '--help' ]; then
    cat << "    EOF"
 
    Usage: ./check_aar_json_storageclass.sh <'aar.json' from 'retrieve_attachments_from_iun'> 

    EOF
    exit 0
fi 

AAR_FILE=$1

# cat aar.json
#<IUN>,<FILEKEY>
# ...

[ -f to_retrieve_$AAR_FILE ] && > to_retrieve_$AAR_FILE 

echo -e "\n ------------------------------------------------------------"
echo "                 FILEKEY                     | STORAGECLASS  "
echo " ------------------------------------------------------------"
while read ROW
do
    FILEKEY=$(echo $ROW | awk 'BEGIN{FS=","}{print $2}')
    STORAGE_CLASS=$(aws s3api get-object-attributes --bucket pn-safestorage-eu-south-1-350578575906 \
        --key $FILEKEY \
        --object-attributes "StorageClass" \
        --profile sso_pn-confinfo-prod | jq -r '.StorageClass' )
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
