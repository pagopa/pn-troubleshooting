
#! /bin/bash -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

find ./input_data/conf_obj/data -name '*.json' | sed -e 's/^/cat /' | bash \
     | jq -r '. | .Item.physicalAddress.M.address.S = "" | .Item.physicalAddress.M.at.S = "" | .Item.physicalAddress.M.addressDetails.S = "" | .Item.physicalAddress.M.municipalityDetails.S = "" | .Item.denomination="" | .Item.newPhysicalAddress = null | .Item.digitalAddress = null | tojson' \
     | gzip > ./input_data/conf_obj/anonymized.json.gz



