#! /bin/bash -e

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

mkdir -p ${SCRIPT_DIR}/classes
javac -classpath ${SCRIPT_DIR}/libs/jettison-1.5.4.jar \
      -d ${SCRIPT_DIR}/classes \
      ${SCRIPT_DIR}/src/java/it/pagopa/pn/scripts/data/invoicing/*.java

mkdir -p ./out
rm -rf ./out/TABLE_NAME_*

jshell --class-path ${SCRIPT_DIR}/libs/jettison-1.5.4.jar:${SCRIPT_DIR}/classes ${SCRIPT_DIR}/src/java/Script.java \
    "-R-Xmx2g" \
    "-R-Darg1=input_data/conf_obj/data" \
    "-R-Darg2=input_data/timeline/TABLE_NAME_pn-TimelinesForInvoicing" \
    "-R-Darg3=./out/TABLE_NAME_pn-TimelinesForInvoicing"

echo "Ended with exit code $?"

( cd out && tar cvzf ./pn-TimelineForInvoicing-redo-until-202309.tgz ./TABLE_NAME_pn-TimelinesForInvoicing )
echo "Archive Generated in ./out/pn-TimelineForInvoicing-redo-until-202309.tgz"