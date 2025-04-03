# check_nr_response

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Dato in input il file contentente, per ogni linea, un singolo messaggio in formato JSON della coda SQS "pn-national-registries-gateway-inputs-DLQ", lo script:
- estrae correlationId e referenceRequestDate;
- estrae lo IUN dal correlationId;
- verifica che non esiste l’elemento di risposta da NR (NATIONAL_REGISTRY_RESPONSE.CORRELATIONID_<correlationId>), in caso contrario verrà stampato un warning e proseguirà con messaggio successivo;
- Stampa la differenza in ore tra Date.now() e referenceRequestDate.

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