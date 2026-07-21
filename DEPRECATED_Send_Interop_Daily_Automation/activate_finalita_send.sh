#!/bin/bash

echo "Assicurati di aver copiato il token Bearer nella clipboard."
echo "Premi Invio per continuare..."
read

# Legge il token dalla clipboard
TOKEN=$(pbpaste)
MAXAPIDAILYCALL=20001
OUTPUTDIR=output/finalita

# Creazione della directory di output:
mkdir -p $OUTPUTDIR

# Cambio directory di esecuzione e pulizia dei file di output:
rm -rf $OUTPUTDIR/*
cd $OUTPUTDIR 

# Esecuzione Curl per verificare gli enti con finalita' in attesa di approvazione:
curl --location 'https://selfcare.interop.pagopa.it/1.0/backend-for-frontend/producers/purposes?states=WAITING_FOR_APPROVAL&limit=50&offset=0&producersIds=4a4149af-172e-4950-9cc8-63ccc9a6d865' \
--header 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0' \
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
-o pending_finalita.json

# Verifica se pending_finalita.json è stato generato
if [[ ! -f "pending_finalita.json" || ! -s "pending_finalita.json" ]]; then
  echo "Errore: pending_finalita.json non trovato o vuoto controlla che ci sia qualcosa da approvare."
  exit 1
fi

# Elabora pending_finalita.json per estrarre le coppie ID e VERSION
pairs=$(cat pending_finalita.json | jq -r ".results[] | select(.waitingForApprovalVersion.dailyCalls < $MAXAPIDAILYCALL) | [.id, .waitingForApprovalVersion.id] | @csv")

# Verifica se sono state trovate coppie
if [[ -z "$pairs" ]]; then
  echo "Nessuna coppia ID e VERSION trovata."
  exit 0
fi

# Itera attraverso ogni coppia ID e VERSION
echo "Esecuzione della seconda chiamata CURL per ogni coppia ID e VERSION..."
while IFS=',' read -r id version; do
  # Rimuove eventuali virgolette dai valori
  id=$(echo "$id" | tr -d '"')
  version=$(echo "$version" | tr -d '"')

  # Esegue la seconda chiamata CURL
  echo "Eseguendo attivazione per ID: $id e VERSION: $version..."
  curl --location "https://selfcare.interop.pagopa.it/1.0/backend-for-frontend/purposes/$id/versions/$version/activate" \
  -X POST \
  --header 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0' \
  --header 'Accept: application/json, text/plain, */*' \
  --header 'Accept-Language: it-IT' \
  --header 'Accept-Encoding: gzip, deflate, br, zstd' \
  --header "Authorization: $TOKEN" \
  --header 'X-Correlation-Id: 179c7a1d-feb1-41e8-9bea-b09fa963dd2c' \
  --header 'Origin: https://selfcare.interop.pagopa.it' \
  --header 'Connection: keep-alive' \
  --header 'Sec-Fetch-Dest: empty' \
  --header 'Sec-Fetch-Mode: cors' \
  --header 'Sec-Fetch-Site: same-origin' \
  --header 'Priority: u=0' \
  --header 'Content-Length: 0' \
  --header 'TE: trailers' \
  -o output_curl_activation_finalita.log

  # Controlla il risultato della chiamata
  if [[ $? -eq 0 ]]; then
    echo "Attivazione Finalita' completata per ID: $id e VERSION: $version." >> output_finalita.log
  else
    echo "Errore durante l'attivazione della finalita' per ID: $id e VERSION: $version." >> output_finalita.log
  fi
done <<< "$pairs"

echo "Tutte le operazioni sono state completate. Verifica da Web la corretta attivazione"

