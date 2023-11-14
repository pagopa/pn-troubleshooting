#! /bin/bash -e


SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )


aws --profile sso_pn-confinfo-prod --region eu-south-1\
    ec2 describe-network-interfaces \
    --no-paginate \
  | jq '.NetworkInterfaces | .[] ' \
  | jq ' { "account":"confinfo", "grpId": .Groups[0].GroupId, "grpName": .Groups[0].GroupName, "desc": .Description, "az": .AvailabilityZone,  "privIp": .PrivateIpAddress, "pubIp": .Association.PublicIp }' \
  | jq -r '. | tojson' | sort | tee confinfo.log


aws --profile sso_pn-core-prod --region eu-south-1\
    ec2 describe-network-interfaces \
    --no-paginate \
  | jq '.NetworkInterfaces | .[] ' \
  | jq ' { "account":"core", "grpId": .Groups[0].GroupId, "grpName": .Groups[0].GroupName, "desc": .Description, "az": .AvailabilityZone,  "privIp": .PrivateIpAddress, "pubIp": .Association.PublicIp }' \
  | jq -r '. | tojson' | sort | tee core.log

