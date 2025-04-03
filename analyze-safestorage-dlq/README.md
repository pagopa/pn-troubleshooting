# Analyze SafeStorage DLQ

Script di analisi dei messaggi nelle DLQ di SafeStorage.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
  * [Prerequisiti](#prerequisiti)
* [Utilizzo](#utilizzo)
  * [Preparazione](#preparazione)
  * [Esecuzione](#esecuzione)
  * [Formato Output](#formato-output)


## Descrizione

Lo script esegue le seguenti operazioni in base alla coda DLQ specificata:

Per `pn-ss-main-bucket-events-queue-DLQ`:
1. Legge in input il dump dei messaggi dalla coda DLQ come prelevati dallo script [dump_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_sqs)
2. Per ogni messaggio:
   - Estrae la chiave dell'oggetto S3 dal messaggio
   - Accerta la presenza nel bucket principale e l'assenza nel bucket di staging
   - Controlla il documentLogicalState nella tabella `pn-SsDocumenti` in base al suo prefisso
   - Verifica che la richiesta creazione del documento non sia l'ultimo evento in timeline [solo per documenti PN_AAR e PN_LEGAL_FACTS]

Per `pn-safestore_to_deliverypush-DLQ`:
1. Legge in input il dump dei messaggi dalla coda DLQ
2. Per ogni messaggio:
   - Estrae la chiave dell'oggetto S3 dal messaggio
   - Aggiunge il prefisso `safestorage://` alla chiave
   - Verifica che la chiave non sia presente nella tabella `pn-DocumentCreationRequestTable`

I risultati delle verifiche vengono salvati in:
- `results/need_further_analysis_${queueName}_${date}.json` per i messaggi che non superano i controlli
- `results/safe_to_delete_${queueName}_${date}.json` per i messaggi che superano tutti i controlli, contenente solo gli MD5 necessari per la cancellazione

## Installazione

### Prerequisiti

Lo script è stato testato con Node LTS v22.13.0 e richiede versione minima v16.0.0

```bash
npm install
```

## Utilizzo

### Preparazione

```bash
aws sso login --profile sso_pn-core-<env>
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione

```bash
node index.js --envName <env> --dumpFile <path> --queueName <queue>
```
oppure
```bash
node index.js -e <env> -f <path> -q <queue>
```

Dove:
- `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
- `<path>` è il percorso al file JSON contenente i messaggi DLQ da analizzare
- `<queue>` è il nome della coda DLQ da analizzare, deve essere uno tra:
  - `pn-ss-main-bucket-events-queue-DLQ`
  - `pn-safestore_to_deliverypush-DLQ`

Esempi:

Per analizzare messaggi dalla `pn-ss-main-bucket-events-queue-DLQ`:
```bash
node index.js -e dev -f ./dump.json -q pn-ss-main-bucket-events-queue-DLQ
```

Per analizzare messaggi dalla `pn-safestore_to_deliverypush-DLQ`:
```bash
node index.js -e dev -f ./dump.json -q pn-safestore_to_deliverypush-DLQ
```

### Formato Output

Per entrambe le code, i risultati delle verifiche vengono salvati in:
- `results/need_further_analysis_${queueName}_${date}.json` per i messaggi che non superano i controlli
- `results/safe_to_delete_${queueName}_${date}.json` per i messaggi che superano tutti i controlli

Per i messaggi che superano tutti i controlli, il file `safe_to_delete_${queueName}_${date}.json` contiene una riga per messaggio nel formato:

```json
{"MD5OfBody": "abc123", "MD5OfMessageAttributes": "xyz789"}
```
oppure, se non sono presenti attributi:
```json
{"MD5OfBody": "def456"}
```

Per i messaggi che non superano i controlli, il file `need_further_analysis_${queueName}_${date}.json` contiene il messaggio completo con dettagli aggiuntivi sul tipo di errore riscontrato.