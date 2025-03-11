#!/bin/bash

if [ "$#" -ne 3 ]; then
    exit 1
fi

CSV_PATH="$1"                                       # Path del file CSV (passato come primo argomento)
API_BASE_URL="$2"                                   # Base URL per l'API (passato come secondo argomento)
CX_UID="$3"                                         # UID per l'API (passato come terzo argomento)
OK_OUTPUT_FILE="ok_result"                          # Nome del file di output in caso di successo

FOLDER_SUFFIX=$(date +%Y%m%d_%H%M%S)                # Suffix per il file di output basato sulla data e ora corrente

function extract_cx_id() {
    local =$(basenane "$1")                         # Estrae il nome del file dal percorso
    CF=$(echo $filename | grep -oE '[0-9]{11}')     # Estrae il codice fiscale dal nome del file
    if [ -z "$CF" ]; then
        echo "Errore: il codice fiscale presente nel nome del file $filename non esiste oppure non é della lunghezza corretta."
        exit 1
    fi 
    echo $CF                                        # Restituisce il codice fiscale
}

calculate_sha256() {
    local file=$1
    sha256sum "$file" | awk '{print $1}' | xxd -r -p | base64  # Calcola il checksum SHA-256 del file e lo converte in base64
}

if [ ! -f "$CSV_PATH" ]; then
    echo "Errore: il file $CSV_PATH non esiste."
    exit 1
fi

CHECKSUM=$(calculate_sha256 "$CSV_PATH")            # Calcola il checksum del file CSV
CX_ID=$(extract_cx_id "$CSV_PATH")                  # Estrae il codice fiscale dal nome del file CSV

RESPONSE=$(curl POST "$API_BASE_URL/radd-net/api/v1/registry/import/upload" \
           -H "uid: $CX_UID" \
           -H "x-pagopa-pn-cx-id: $CX_ID" \
           -H "x-pagopa-pn-cx-type: RADD" \
           -H "Content-Type: application/json" \
           -d '{"checksum": "'"$CHECKSUM"'"}'
           )                                        # Invia una richiesta POST per ottenere l'URL di upload

URL=$(echo "$RESPONSE" | jq -r '.url')              # Estrae l'URL di upload dalla risposta
SECRET=$(echo "$RESPONSE" | jq -r '.secret')        # Estrae il secret dalla risposta
REQUEST_ID=$(echo "$RESPONSE" | jq -r '.requestId') # Estrae l'ID della richiesta dalla risposta

if [ -z "$URL" ] || [ -z "$SECRET" ]; then
    echo "Errore: Risposta incompleta, URL o secret mancanti."
    exit 1
fi

curl -X PUT "$URL" \
    -H "Content-Type: text/csv" \
    -H "x-amz-meta-secret: $SECRET" \
    -H "x-amz-checksum-sha256: $CHECKSUM" \
    --data-binary "@$CSV_PATH"                      # Carica il file CSV all'URL specificato


echo ${CX_ID},${CSV_PATH},${REQUEST_ID} | tee ${OK_OUTPUT_FILE}_${FILE_SUFFIX}  # Salva i dettagli della richiesta in un file di output


