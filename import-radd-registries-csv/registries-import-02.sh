#!/bin/bash

if [ "$#" -ne 3 ]; then
    exit 1
fi

CSV_PATH="$1"                                       # Path del file CSV (passato come primo argomento)
API_BASE_URL="$2"                                   # Base URL per l'API (passato come secondo argomento)
CX_UID="$3"                                         
OK_OUTPUT_FILE="ok_result"

RESULTS_FOLDER=./results_$(date +%Y%m%d_%H%M%S)
mkdir -p $RESULTS_FOLDER

function extract_cx_id() {
    local =$(basenane "$1")
    CF=$(echo $filename | grep -oE '[0-9]{11}') 
    if [ -z "$CF" ]; then
        echo "Errore: il codice fiscale presente nel nome del file $filename
        non esiste oppure non é della lunghezza corretta." | tee ${RESULTS_FOLDER}/failed.txt 
        continue       
    fi 
    echo $CF
}

calculate_sha256() {
    local file=$1
    sha256sum "$file" | awk '{print $1}' | xxd -r -p | base64
}

if [ ! -f "$CSV_PATH" ]; then
    echo "Errore: il file $CSV_PATH non esiste."
    exit 1
fi


CHECKSUM=$(calculate_sha256 "$CSV_PATH")
CX_ID=$(extract_cx_id "$CSV_PATH")

RESPONSE=$(curl POST "$API_BASE_URL/radd-net/api/v1/registry/import/upload" \
           -H "uid: $CX_UID" \
           -H "x-pagopa-pn-cx-id: $CX_ID" \
           -H "x-pagopa-pn-cx-type: RADD" \
           -H "Content-Type: application/json" \
           -d '{"checksum": "'"$CHECKSUM"'"}'
           )

URL=$(echo "$RESPONSE" | jq -r '.url')
SECRET=$(echo "$RESPONSE" | jq -r '.secret')
REQUEST_ID=$(echo "$RESPONSE" | jq -r '.requestId')

if [ -z "$URL" ] || [ -z "$SECRET" ]; then
    echo "Errore: Risposta incompleta, URL o secret mancanti per il file $CSV_PATH" |  tee ${RESULTS_FOLDER}/failed.txt
    continue
fi

curl -X PUT "$URL" \
    -H "Content-Type: text/csv" \
    -H "x-amz-meta-secret: $SECRET" \
    -H "x-amz-checksum-sha256: $CHECKSUM" \
    --data-binary "@$CSV_PATH"

if [ $? -ne 0 ]; then
    echo "Errore: import fallito." | tee ${RESULTS_FOLDER}/failed.txt
    continue
else 
    echo ${CX_ID},${CSV_PATH},${REQUEST_ID} | tee ${OK_OUTPUT_FILE}_${FILE_SUFFIX}  tee ${RESULTS_FOLDER}/succeeded.csv
fi

