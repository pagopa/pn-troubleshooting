#!/bin/bash

if [ "$#" -ne 4 ]; then
    exit 1
fi

CSV_PATH="$1"                                       # Path del file CSV (passato come primo argomento)
API_BASE_URL="$2"                                   # Base URL per l'API (passato come secondo argomento)
CX_ID="$3"                                          # x-pagopa-pn-cx-id (passato come terzo argomento)
CX_UID="$4"                                         # UID (passato come quinto argomento)

calculate_sha256() {
    local file=$1
    sha256sum "$file" | awk '{print $1}' | xxd -r -p | base64
}

if [ ! -f "$CSV_PATH" ]; then
    echo "Errore: il file $CSV_PATH non esiste."
    exit 1
fi

CHECKSUM=$(calculate_sha256 "$CSV_PATH")

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
    echo "Errore: Risposta incompleta, URL o secret mancanti."
    exit 1
fi

curl -X PUT "$URL" \
    -H "Content-Type: text/csv" \
    -H "x-amz-meta-secret: $SECRET" \
    -H "x-amz-checksum-sha256: $CHECKSUM" \
    --data-binary "@$CSV_PATH"

echo "Richiesta di import massivo completata."
echo "REQUEST_ID: $REQUEST_ID"
