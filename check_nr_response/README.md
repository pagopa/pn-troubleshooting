# check_nr_response

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Dato in input un file contentente, per ogni linea, un messaggio in formato JSON della coda "pn-national-registries-gateway-inputs-DLQ", 
lo script:
- estrae correlationId e referenceRequestDate;
- estrae lo IUN dal correlationId stampa la differenza in ore tra Date.now() e referenceRequestDate;
- Se il correlationId non è del tipo "NATIONAL_REGISTRY_CALL" stampa la differenza in ore tra Date.now() e referenceRequestDate;
- Se il correlationId è del tipo "NATIONAL_REGISTRY_CALL" verifica l'esistenza in timeline della risposta da NR (NATIONAL_REGISTRY_RESPONSE.CORRELATIONID_<correlationId>):
  - Se esiste: stampa un warning e prosegue con il messaggio successivo;
  - Se non esiste: Stampa la differenza in ore tra Date.now() e referenceRequestDate.

## Installazione

```bash
npm install
```

## Utilizzo

1. Creare, a partire dal dump, un file dove ogni riga rappresenta un singolo messaggio SQS in formato JSON:

```bash
jq -c '.[]' <dump SQS> > <json in line file>
```
2. Eseguire lo script node:

```bash
node index.js \
    [--region <region>] \
    [--env <env>] \
    --sqsDumpFile <json in line file>
```
Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- sqsDumpFile: è il file contentente, per ogni riga, un messaggio SQS in formato json

3. [Opzionale] Ordinare l'output dello script rispetto all'attributo "approxElapsedDaysFromNow"
```bash
jq -s '. | sort_by(.approxElapsedDaysFromNow) | reverse' <script output>.json | jq -c '.[]' >> <sorted script output>.json
```
