#!/bin/bash

LOG_FILE_PREFIX=../import-radd-registries-csv/GO_Test_*

#--------------

OUTPUT_FILE="concat.csv"
HEADER="CX_UID,CSV_PATH,CX_ID,REQUEST_ID"

for FILE in $(ls -1 ${LOG_FILE_PREFIX}*)
do
        grep -v "${HEADER}" ${FILE} >> ${OUTPUT_FILE}
done
sed -i "/${HEADER}/d" ${OUTPUT_FILE}
sed -i "1 i ${HEADER}" ${OUTPUT_FILE}
