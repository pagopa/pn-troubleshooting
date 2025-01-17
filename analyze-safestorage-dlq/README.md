# Analyze SafeStorage DLQ

Script di analisi dei messaggi in DLQ dalla coda eventi di SafeStorage.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Preparazione](#preparazione)
  * [Esecuzione](#esecuzione)

## Descrizione

Lo script esegue le seguenti operazioni:

1. Recupera i messaggi dalla coda DLQ `pn-ss-main-bucket-events-queue-DLQ`
2. Per ogni messaggio:
   - Estrae la chiave dell'oggetto S3 dal messaggio
   - Accerta la presenza nel bucket principale e l'assenza nel bucket di staging
   - Controlla il documentLogicalState nella tabella `pn-SsDocumenti` in base al suo prefisso
   - Verifica che la richiesta creazione del documento non sia l'ultimo evento in timeline

I risultati delle verifiche vengono salvati in:
- `results/errors.json` per i messaggi che non superano i controlli
- `results/ok.json` per i messaggi che superano tutti i controlli

I dump dei messaggi DLQ vengono salvati in `temp/sqs_dump.txt`

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
node analyze-safestorage-dlq.js --envName <env>
```
oppure
```bash
node analyze-safestorage-dlq.js -e <env>
```

Dove:
- `<env>` è l'ambiente di destinazione, deve essere uno tra: `dev`, `uat`, `test`, `prod`, `hotfix`

Lo script richiede l'accesso AWS sia al profilo Core che ConfInfo dell'ambiente specificato per poter accedere a tutte le risorse necessarie.