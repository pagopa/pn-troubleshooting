#!/bin/bash

# --- Variabili ---

CSV_PATH="$1"                                       # Path del file CSV (passato come primo argomento)
API_BASE_URL="$2"                                   # Base URL per l'API (passato come secondo argomento)
CX_UID="$3"					    # # UID (passato come quinto argomento)                           

# --- Funzioni ---

extract_cx_id() {

    local FILE=$(basename "$1")
    CF=$(echo $FILE | grep -oE '[0-9]{11}') 

    if [ -z "$CF" ]; then
        echo "Errore: il codice fiscale presente nel nome del file \"$filename\"
              non esiste oppure non è della lunghezza corretta."
        exit 1
    fi 
    echo $CF
}

calculate_sha256() {
    local FILE=$1
    sha256sum "$FILE" | awk '{print $1}' | xxd -r -p | base64
}

# --- Script --- 

if [ "$1" == "" ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    echo -e "\nUtilizzo: $0 \"{CSV_PATH}\" \"{API_BASE_URL}\" \"{CX_UID}\"\n"
    exit 0
fi

if [ "$#" -ne 3 ]; then
    cat << EOM

Errore: Il numero di argomenti deve essere 3. Usa:
	
	$0 --help
	
per ottenere informazioni sull'utilizzo del comando.

EOM
    exit 1
fi

if [ ! -f "$CSV_PATH" ]; then
    echo -e "\nErrore: Il file $CSV_PATH non esiste.\n"
    exit 2
fi

CHECKSUM=$(calculate_sha256 "$CSV_PATH")

# Estrazione CX_ID dal nome del file CSV
CX_ID=$(extract_cx_id "$CSV_PATH")

RESPONSE=$(curl -X POST "$API_BASE_URL/radd-net/api/v1/registry/import/upload" \
           -H "uid: $CX_UID" \
           -H "x-pagopa-pn-cx-id: $CX_ID" \
           -H "x-pagopa-pn-cx-type: RADD" \
           -H "Content-Type: application/json" \
           -d '{"checksum": "'"$CHECKSUM"'"}'
           )

URL=$(echo "$RESPONSE" | jq -r '.url')
SECRET=$(echo "$RESPONSE" | jq -r '.secret')
REQUEST_ID=$(echo "$RESPONSE" | jq -r '.requestId')

if [ -z "$URL" ] || [ -z "$SECRET" ] || [ -z "$REQUEST_ID" ] ; then
    echo "Errore: Risposta incompleta, URL, Secret o RequestID mancanti."
    exit 3
fi

curl -X PUT "$URL" \
    -H "Content-Type: text/csv" \
    -H "x-amz-meta-secret: $SECRET" \
    -H "x-amz-checksum-sha256: $CHECKSUM" \
    --data-binary "@$CSV_PATH"

RESULT_FILE_NAME=${CX_UID}_$(date +%Y%m%d_%H%M%S)
cat << EOF >> $RESULT_FILE_NAME 
CX_UID,CSV_PATH,CX_ID,REQUEST_ID
${CX_UID},${CSV_PATH},${CX_ID},${REQUEST_ID} 
EOF

echo "Richiesta di import massivo completata."
echo "REQUEST_ID:   $REQUEST_ID"
echo "Risultati delle operazioni memorizzati sul file: $RESULT_FILE_NAME"

