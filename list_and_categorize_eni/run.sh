#! /bin/bash -e


SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

metadata_file="metadata.json"
output_file="ip_classification.txt"

echo "List current IPs"
# aws --profile sso_pn-confinfo-prod --region eu-south-1\
#     ec2 describe-network-interfaces \
#     --no-paginate \
#   | jq '.NetworkInterfaces | .[] ' \
#   | jq ' { "account":"confinfo", "grpId": .Groups[0].GroupId, "grpName": .Groups[0].GroupName, "desc": .Description, "az": .AvailabilityZone,  "privIp": .PrivateIpAddress, "pubIp": .Association.PublicIp }' \
#   | jq -r '. | tojson' | sort > confinfo.log


# aws --profile sso_pn-core-prod --region eu-south-1\
#     ec2 describe-network-interfaces \
#     --no-paginate \
#   | jq '.NetworkInterfaces | .[] ' \
#   | jq ' { "account":"core", "grpId": .Groups[0].GroupId, "grpName": .Groups[0].GroupName, "desc": .Description, "az": .AvailabilityZone,  "privIp": .PrivateIpAddress, "pubIp": .Association.PublicIp }' \
#   | jq -r '. | tojson' | sort > core.log


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

