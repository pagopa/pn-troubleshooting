# Dump SQS messages

Script di dump dei messaggi presenti in una coda SQS.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input una coda DLQ, effettua le seguenti operazioni:
1) Recupero messaggi dalla DLQ.
2) Scrive i messaggi all'interno di un file JSON

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node dump_sqs.js --awsProfile <aws-profile> --queueName <queue-name> [--format <output-format>] [--visibilityTimeout <visibility-timeout>]
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<queue-name>` è il nome della coda SQS;
- `<visibility-timeout>` è il valore del visibilityTimeout nella receiveMessage verso SQS (default 20 secondi);
- `<output-format>` è il formato della coda che può assumere i valori "raw" (default) o "ss" (per post-analisi SafeStorage).

**Nota**:
Un VisibilityTimeout di 60 secondi è sufficiente per scodare 1000 messaggi. E' importante impostare un valore sufficientemente alto come VisibilityTimeout affinché lo script termini la sua esecuzione prima della sua scadenza; in caso contrario si genererebbe un loop infinito.