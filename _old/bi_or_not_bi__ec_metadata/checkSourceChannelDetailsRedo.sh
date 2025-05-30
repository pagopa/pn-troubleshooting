#!/usr/bin/env /bin/bash

log_file=out/sourceChannelDetailsRedo_diff_logs.txt

echo "" > $log_file

while IFS= read -r line
do
  echo "FILE: $line" | tee -a $log_file
  orig_file=$( echo $line | sed -e 's|./out/fixed_cdc/notifications/sourceChannelDetails/cdcTos3/|/Users/mvit/Documents/pn/pn-troubleshooting/bi_or_not_bi/rstudio-server/workspace/data/cdc/|' )
  cat $line | jq -r '{ "iun": .dynamodb.NewImage.iun.S, "sc": .dynamodb.NewImage.sourceChannel.S, "scd": .dynamodb.NewImage.sourceChannelDetails.S} | tojson' \
            | jq -r '. | select( .iun | contains("##") | not) | tojson ' \
            | jq -r '. | select( .sc=="B2B" and .scd=="INTEROP" | not) | tojson ' \
            | jq -r '. | select( .sc=="B2B" and .scd=="NONINTEROP" | not) | tojson ' \
            | jq -r '. | select( .sc=="WEB" and .scd==null | not) | tojson ' \
            | sed -e 's/^/NOT ACCEPTED /' \
            | tee -a $log_file
  jd <( jq -sr '. | tojson' $orig_file ) <( jq -sr '. | tojson' $line ) | sed -e 's/^/DIFF: /' \
     | tee -a $log_file
done < <( find ./out/fixed_cdc  -type f | sort )

echo "CHANGED PROPERTIES"
cat $log_file| grep -E "^DIFF: @" | sed -e 's/@ \[[0-9]*/[nn/' | sort -u

echo "ERRORS"
cat $log_file| grep -E "^NOT ACCEPTED " 