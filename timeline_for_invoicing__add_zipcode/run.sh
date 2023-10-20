#! /bin/bash -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
fromDir="./input_data/timeline/TABLE_NAME_pn-TimelinesForInvoicing"

mkdir -p ${SCRIPT_DIR}/classes
javac -classpath ${SCRIPT_DIR}/libs/jettison-1.5.4.jar \
      -d ${SCRIPT_DIR}/classes \
      ${SCRIPT_DIR}/src/java/it/pagopa/pn/scripts/data/invoicing/*.java

mkdir -p ./out
rm -rf ./out/TABLE_NAME_*
rm -rf ./out/diffs
mkdir -p ./out/diffs

java --class-path ${SCRIPT_DIR}/libs/jettison-1.5.4.jar:${SCRIPT_DIR}/classes \
    -Xmx2g \
    it.pagopa.pn.scripts.data.invoicing.FixTimeline4Invoicing \
    "FixTimeline4Invoicing" \
    "./input_data/conf_obj/anonymized.json.gz" \
    "${fromDir}" \
    "./out/TABLE_NAME_pn-TimelinesForInvoicing"

echo "Ended with exit code $?"

( cd out && tar czf ./pn-TimelineForInvoicing-redo.tgz ./TABLE_NAME_pn-TimelinesForInvoicing )
echo "Archive Generated in ./out/pn-TimelineForInvoicing-redo.tgz"

num_files=$( find ${fromDir} -type f -and -not -name ".DS_Store" | wc -l | tr -d '\n ')

echo "List differencies"
find ${fromDir} \
      -type f -and -not -name ".DS_Store" \
      -exec echo echo {} \&\& jd \<\( jq -sr \'. \| tojson\' {} \) \<\( jq -sr \'. \| tojson\' {} \) \> {} \; \
     | sed -e 's|/input_data/timeline/|/out/diffs/|4' \
     | sed -e 's|/input_data/timeline/|/out/|3' \
     | sed -e 's|/out/diffs/.*/|/out/diffs/|' \
     | sed -e 's/^/( / ; s/$/ ) \&/' \
     | awk '{ if ((NR % 100) == 1) printf("wait $(jobs -p)\n"); print; }' \
     | sed '$ s/$/\nwait $(jobs -p)/' \
     | bash | grep -n . | sed -e "s/^/[total $num_files] /"

echo "Summarize diffs"
find ./out/diffs -not -type d -exec echo {} \; -exec cat {} \; \
     | gzip > ./out/all_diffs.txt.gz
