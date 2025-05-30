#! /bin/bash -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
fromDir="./input_data/timeline/TABLE_NAME_pn-TimelinesForInvoicing"

mkdir -p ${SCRIPT_DIR}/classes
javac -classpath $( find ${SCRIPT_DIR}/libs/ -name *.jar | sed -e 's/$/:/' | tr -d '\n' | sed -e 's/:$//') \
      -d ${SCRIPT_DIR}/classes \
      -Xlint:unchecked \
      ${SCRIPT_DIR}/src/main/java/it/pagopa/pn/scripts/data/invoicing/*.java

mkdir -p ./out
rm -rf ./out/TABLE_NAME_*
rm -rf ./out/diffs
mkdir -p ./out/diffs

timeline_dir=""
if ( [ ! "$1" == "--no-checks" ] ) then
  timeline_dir="./input_data/timeline/TABLE_NAME_pn-Timelines/"
fi

java --class-path $( find ${SCRIPT_DIR}/libs/ -name *.jar | sed -e 's/$/:/' | tr -d '\n' )${SCRIPT_DIR}/classes \
    -Xmx6g \
    it.pagopa.pn.scripts.data.invoicing.FixTimeline4Invoicing \
    "FixTimeline4Invoicing" \
    "./input_data/conf_obj/anonymized.json.gz" \
    "${fromDir}" \
    "./out/TABLE_NAME_pn-TimelinesForInvoicing" \
    ${timeline_dir}

echo "Ended with exit code $?"

( cd out && tar czf ./pn-TimelineForInvoicing-redo.tgz ./TABLE_NAME_pn-TimelinesForInvoicing )
echo "Archive Generated in ./out/pn-TimelineForInvoicing-redo.tgz"


if ( [ ! "$1" == "--no-checks" ] ) then

  echo "List differencies"
  num_files=$( find ${fromDir} -type f -and -not -name ".DS_Store" | wc -l | tr -d '\n ')

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

  echo "Check ids"
  find ./input_data/timeline/TABLE_NAME_pn-TimelinesForInvoicing/ -type f -and -not -name ".DS_Store" -exec cat {} \; \
       | jq -r .eventID | sort > out/diffs/src_events_ids.txt
  find ./out/TABLE_NAME_pn-TimelinesForInvoicing -type f -and -not -name ".DS_Store" -exec cat {} \; \
       | jq -r .eventID | sort > out/diffs/dst_events_ids.txt
  diff out/diffs/src_events_ids.txt out/diffs/dst_events_ids.txt | tee out/diffs/id_diffs.txt

  echo "Summarize diffs"
  find ./out/diffs -not -type d -exec echo {} \; -exec cat {} \; \
      | gzip > ./out/all_diffs.txt.gz
  gzcat ./out/all_diffs.txt.gz | grep -e "^@" | sed -e 's/^@ [[0-9][0-9]*/@ [XX/' \
      | sort -u \
      > ./out/modified_properties.txt
fi
