# Retrieve_registrycall_from_athena

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Recupero, tramite AWS Athena, di chiamate verso i registri nazionali senza risposta. Il timestamp utilizzato è quello relativo all'ultimo timelineElementId con category = "PUBLIC_REGISTRY_CALL" presente in timeline.

I risultati delle operazioni verranno salvati all'interno della cartella "results".


## Installazione

```bash
npm install
```

## Utilizzo

### Caso 1: E' disponibile il file con l'elenco degli IUN impattati

1. Configurare lo script **retrieve_logs_from_athena.sh** valorizzando 
opportunamente la variabili nella sezione "Variables". Il file di input 
contenente l'elenco degli IUN deve essere fornito tramite la variabile **IUN_LIST_FILE**.
**NB**: Questo script esegue [timelines_from_iuns](https://github.com/pagopa/pn-troubleshooting/tree/main/timelines_from_iuns) ed elabora opportunamente il suo output tramite **jq**;
2. Eseguire lo script retrieve_logs_from_athena.sh. Questo script fornirà 
in output i file:
    - **TIMEL4IUN**="timelines_from_iun.json": File contentente la timeline associata agli IUN in esame;
    - **OK_IUN**="public_registry_call.json": File contentente, per ogni IUN, l'ultimo timelineElementId  
con category = PUBLIC_REGISTRY_CALL e il suo timestamp.
```bash
./retrieve_logs_from_athena.sh
```


3. Eseguire lo script node.js "index.js"

```bash

node index.js \
    [--region <region>] \
    [--env <env> \
    [--accountType <core|hotfix>] \
    --action: <exec> \
    --okIunFile public_registry_call.json \ # output di retrieve_logs_from_athena.sh
    [--startIun <iun> ] \

```

Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- action: è la modalità di funzionamento dello script;
- okIunFile: è il file generato dallo script "retrieve_logs_from_athena.sh"; 
- startIun: IUN di partenza.

### Caso 2: E' già stata eseguita la query verso Athena e si vogliono recuperare i risultati tramite QueryExecutionId

```bash

node index.js \
    [--region <region>] \
    [--env <env> \
    [--accountType <core|hotfix>] \
    --action: retrieve \
    --reqIdFile <QueryExecutionId file> \
    [--starReqId <QueryExecutionId> ]

```

Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- action: è la modalità di funzionamento dello script;
- reqIdFile: è il file di input dal quale recuperare i QueryExecutionId. Ogni riga dovrà essere un JSON contente almeno il campo **QueryExecutionId**:
{"QueryExecutionId":"...",...,"\<key\>": "\<value\>"}
