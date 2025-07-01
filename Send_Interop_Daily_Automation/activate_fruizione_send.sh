#!/bin/bash

echo "Assicurati di aver copiato il token Bearer nella clipboard."
echo "Premi Invio per continuare..."
read

# Legge il token dalla clipboard
TOKEN=$(pbpaste)
OUTPUTDIR=output/fruizione

# Creazione della directory di output:
mkdir -p $OUTPUTDIR

# Cambio directory di esecuzione e pulizia di tutti i file di output:
rm -rf $OUTPUTDIR/*
cd $OUTPUTDIR  

# Esecuzione Curl per verificare gli enti con richieste in attesa di approvazione:
curl 'https://selfcare.interop.pagopa.it/1.0/backend-for-frontend/producers/agreements?states=PENDING&limit=50&offset=0' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0' \
--header 'Accept: application/json, text/plain, */*' \
--header 'Accept-Language: it-IT' \
--header 'Accept-Encoding: gzip, deflate, br, zstd' \
--header "Authorization: $TOKEN" \
--header 'X-Correlation-Id: 123c30cd-448c-48c4-be8a-aa7265c46484' \
--header 'Connection: keep-alive' \
--header 'Cookie: OptanonConsent=isGpcEnabled=0^&datestamp=Mon+Jun+30+2025+20%3A52%3A16+GMT%2B0200+(Central+European+Summer+Time)^&version=202404.1.0^&browserGpcFlag=0^&isIABGlobal=false^&hosts=^&consentId=56c9c355-6c0e-46a7-9dca-d1a7f3a708b5^&interactionCount=2^&isAnonUser=1^&landingPath=NotLandingPage^&groups=C0001%3A1%2CC0002%3A1^&intType=1^&geolocation=%3B^&AwaitingReconsent=false; OptanonAlertBoxClosed=2025-06-04T08:56:46.386Z' \
--header 'Sec-Fetch-Dest: empty' \
--header 'Sec-Fetch-Mode: cors' \
--header 'Sec-Fetch-Site: same-origin' \
--header 'TE: trailers' \
-o pending_fruizione.json

# Verifica se pending_fruizione.json è stato generato
if [[ ! -f "pending_fruizione.json" || ! -s "pending_fruizione.json" ]]; then
  echo "Errore: pending_fruizione.json non trovato. Controlla che ci sia qualcosa da approvare."
  exit 1
fi

# Check se le richieste di fruizione sono maggiori di 50
TOTALCOUNT=$(jq -r '.pagination.totalCount' pending_fruizione.json)
if [[ "$TOTALCOUNT" -gt 50 ]]; then
  echo "WARN: Il numero totale di richieste di fruizione ($TOTALCOUNT) è maggiore del limite (50). Iterare lo script per processare le restanti richieste."
fi

# Creazione del file con pdndId, id e name
jq '{results: [ .results[] | { pdndid: .id, id: .consumer.id, name: .consumer.name } ]}' pending_fruizione.json > pending_fruizione_filtered.json

echo "Generato il file pending_fruizione_filtered.json con la tripla {pdndId, id, name}."

# Verifica se pending_fruizione_filtered.json è stato generato
if [[ ! -f "pending_fruizione_filtered.json" || ! -s "pending_fruizione_filtered.json" ]]; then
  echo "Errore: pending_fruizione_filtered.json non trovato o vuoto."
  exit 1
fi

# Itera su ogni ID dal file pending_fruizione_filtered.json e fai la chiamata curl
echo "Eseguendo chiamate CURL per ogni ID presente in pending_fruizione_filtered.json..."
> pending_fruizione_selfcareid.json
echo '{ "tenants": [' > pending_fruizione_selfcareid.json

FIRST=true
for ID in $(jq -r '.results[].id' pending_fruizione_filtered.json); do
  echo "Processando ID: $ID"
  RESPONSE=$(curl -s "https://selfcare.interop.pagopa.it/1.0/backend-for-frontend/tenants/$ID" \
    -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0' \
    --header 'Accept: application/json, text/plain, */*' \
    --header 'Accept-Language: it-IT' \
    --header 'Accept-Encoding: gzip, deflate, br, zstd' \
    --header "Authorization: $TOKEN" \
    --header 'X-Correlation-Id: 37eccc08-c33d-4499-90e2-746266213423' \
    --header 'Connection: keep-alive' \
    --header 'Sec-Fetch-Dest: empty' \
    --header 'Sec-Fetch-Mode: cors' \
    --header 'Sec-Fetch-Site: same-origin' \
    --header 'TE: trailers')

  if [[ "$FIRST" == true ]]; then
    echo "$RESPONSE" >> pending_fruizione_selfcareid.json
    FIRST=false
  else
    echo ", $RESPONSE" >> pending_fruizione_selfcareid.json
  fi
done

# Chiude il JSON
echo '] }' >> pending_fruizione_selfcareid.json

echo "Generato il file pending_fruizione_selfcareid.json con le risposte delle chiamate."

# Arrichisco pending_fruizione_filtered.json con l'oggetto selfcareId 
TEMP_FILE="pending_fruizione_filtered_temp.json"
echo '{ "results": [' > "$TEMP_FILE"

FIRST=true
jq -c '.results[]' pending_fruizione_filtered.json | while IFS= read -r item; do
  ID=$(echo "$item" | jq -r '.id')
  SELFCARE_ID=$(jq --arg id "$ID" -r '.tenants[] | select(.id == $id) | .selfcareId' pending_fruizione_selfcareid.json)

  if [[ -z "$SELFCARE_ID" || "$SELFCARE_ID" == "null" ]]; then
    SELFCARE_ID="null"
  fi

  NEW_ITEM=$(echo "$item" | jq --arg selfcareId "$SELFCARE_ID" '. + {selfcareId: $selfcareId}')

  if [[ "$FIRST" == true ]]; then
    echo "$NEW_ITEM" >> "$TEMP_FILE"
    FIRST=false
  else
    echo ", $NEW_ITEM" >> "$TEMP_FILE"
  fi
done

echo '] }' >> "$TEMP_FILE"
mv "$TEMP_FILE" pending_fruizione_filtered.json
echo "Aggiornato il file pending_fruizione_filtered.json con selfcareId."

# Inserimento della API Key
echo "Inserisci il valore per Ocp-Apim-Subscription-Key:"
read -s SUBSCRIPTION_KEY

# Creazione del file pending_selfcare_result.json con la chiamata API
TEMP_FILE="pending_selfcare_result_temp.json"
> "$TEMP_FILE"
echo '{ "results": [' > "$TEMP_FILE"

FIRST=true
jq -c '.results[]' pending_fruizione_filtered.json | while read -r item; do
  SELFCARE_ID=$(echo "$item" | jq -r '.selfcareId')

  echo "Eseguendo richiesta per selfcareId: $SELFCARE_ID..."
  RESPONSE=$(curl -s --location "https://api.selfcare.pagopa.it/external/v2/institutions/$SELFCARE_ID" \
    --header "Ocp-Apim-Subscription-Key: $SUBSCRIPTION_KEY")

  if ! echo "$RESPONSE" | jq empty > /dev/null 2>&1; then
    echo "Errore: La risposta per selfcareId $SELFCARE_ID non è un JSON valido."
    echo "Risposta ricevuta: $RESPONSE"
    exit 1
  fi

  if [[ "$FIRST" == true ]]; then
    echo "$RESPONSE" >> "$TEMP_FILE"
    FIRST=false
  else
    echo ", $RESPONSE" >> "$TEMP_FILE"
  fi
done

# Chiude il JSON
echo '] }' >> "$TEMP_FILE"
mv "$TEMP_FILE" "pending_selfcare_result.json"

if [[ -f "pending_selfcare_result.json" && -s "pending_selfcare_result.json" ]]; then
  echo "File pending_selfcare_result.json generato con successo."
else
  echo "Errore durante la generazione di pending_selfcare_result.json."
  exit 1
fi

# Arrichisco pending_fruizione_filtered.json con l'oggetto pn+pdnd
TEMP_FILE="pending_fruizione_filtered_temp.json"
echo '{ "results": [' > "$TEMP_FILE"

FIRST=true
jq -c '.results[]' pending_fruizione_filtered.json | while IFS= read -r item; do
  PDNDID=$(echo "$item" | jq -r '.pdndid')
  ID=$(echo "$item" | jq -r '.id')
  NAME=$(echo "$item" | jq -r '.name')
  SELFCARE_ID=$(echo "$item" | jq -r '.selfcareId')

  ONBOARDING=$(jq --arg selfcareId "$SELFCARE_ID" -c '.results[] | select(.id == $selfcareId) | .onboarding' pending_selfcare_result.json)
 
 # Nel caso l'ente abbia SEND e PDND attivi possiamo marcare come "ok"
  HAS_PN=$(echo "$ONBOARDING" | jq -r '.[] | select(.productId == "prod-pn" and .status == "ACTIVE") | .productId' | wc -l)
  HAS_PDND=$(echo "$ONBOARDING" | jq -r '.[] | select(.productId == "prod-interop" and .status == "ACTIVE") | .productId' | wc -l)

  # Elenco dei possibili casi.
  if [[ "$HAS_PN" -gt 0 && "$HAS_PDND" -gt 0 ]]; then
    PN_PDND="ok"
  else
    if [[ "$HAS_PN" -eq 0 && "$HAS_PDND" -eq 0 ]]; then
      PN_PDND="notok: PN e PDND non presenti"
    elif [[ "$HAS_PN" -eq 0 ]]; then
      PN_PDND="notok: PN non presente"
    elif [[ "$HAS_PDND" -eq 0 ]]; then
      PN_PDND="notok: PDND non presente"
    fi
  fi

  NEW_ITEM=$(jq -n \
    --arg pdndid "$PDNDID" \
    --arg id "$ID" \
    --arg name "$NAME" \
    --arg selfcareId "$SELFCARE_ID" \
    --arg pn_pdnd "$PN_PDND" \
    '{pdndid: $pdndid, id: $id, name: $name, selfcareId: $selfcareId, "pn+pdnd": $pn_pdnd}')

  if [[ "$FIRST" == true ]]; then
    echo "$NEW_ITEM" >> "$TEMP_FILE"
    FIRST=false
  else
    echo ", $NEW_ITEM" >> "$TEMP_FILE"
  fi
done

echo '] }' >> "$TEMP_FILE"
mv "$TEMP_FILE" pending_fruizione_filtered.json
echo "Aggiornato il file pending_fruizione_filtered.json con pn+pdnd."

LOG_FILE="activation_log.txt"
> "$LOG_FILE"

echo "Eseguendo attivazione per gli elementi con pn+pdnd = 'ok'..."

# Itera attraverso ogni elemento nel file pending_fruizione_filtered.json
jq -c '.results[] | select(."pn+pdnd" == "ok")' pending_fruizione_filtered.json | while IFS= read -r item; do
  PDNDID=$(echo "$item" | jq -r '.pdndid')
  NAME=$(echo "$item" | jq -r '.name')

  echo "Tentativo di attivazione per PDNDID: $PDNDID, Nome: $NAME..."

  # Esecuzione della curl
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "https://selfcare.interop.pagopa.it/1.0/backend-for-frontend/agreements/$PDNDID/activate" \
    -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0' \
    --header 'Accept: application/json, text/plain, */*' \
    --header 'Accept-Language: it-IT' \
    --header 'Accept-Encoding: gzip, deflate, br, zstd' \
    --header "Authorization: $TOKEN" \
    --header 'X-Correlation-Id: 37eccc08-c33d-4499-90e2-746266213423' \
    --header 'Connection: keep-alive' \
    --header 'Sec-Fetch-Dest: empty' \
    --header 'Sec-Fetch-Mode: cors' \
    --header 'Sec-Fetch-Site: same-origin' \
    --header 'TE: trailers')

  # Verifica il risultato della chiamata e stampo il log di attivazioni delle richieste
  if [[ "$RESPONSE" -eq 200 ]]; then
    echo "$PDNDID, $NAME, attivato con successo" >> "$LOG_FILE"
    echo "PDNDID: $PDNDID attivato con successo."
  else
    echo "$PDNDID, $NAME, attivazione fallita (HTTP $RESPONSE)" >> "$LOG_FILE"
    echo "Errore: PDNDID $PDNDID non attivato. Codice HTTP: $RESPONSE."
  fi
done

echo "Processo di attivazione completato. Log disponibile in $LOG_FILE."