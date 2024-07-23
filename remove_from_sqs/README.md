# Remvoe from sqs

Lo script viene utilizzato per rimuovere runtime eventi presenti in DLQ o SQS con input un file contenente MD5 del body e MD5 degli attributes.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo script viene utilizzato per rimuovere runtime eventi presenti in DLQ o SQS con input un file contenente MD5 del body e MD5 degli attributes.
## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node index.js --account <account> --envName <env-name> --queueName <queue-name> --visibilityTimeout <visibility-timeout> --fileName <file-name> 
```
Dove:
- `<account>` l'account in cui è presente la coda SQS
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<queue-name>` il nome della coda in oggetto
- `<visibility-timeout>` incrementarlo in base al numero di messaggi in coda per non ripescare sempre gli stessi messaggi.
- `<file-name>` file contenente la lista MD5 body e MD5 attributes

Sample file
{"MD5OfBody":"<MD5-Body>","MD5OfMessageAttributes":"<MD5-MessageAttribute>"}
.
.
.
{"MD5OfBody":"<MD5-Body>","MD5OfMessageAttributes":"<MD5-MessageAttribute>"}