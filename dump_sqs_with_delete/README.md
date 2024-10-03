# Dump SQS messages with delete

Script di dump dei messaggi presenti in una coda SQS. Il dump viene fatto in formato JSON inline.
**Inoltre lo script, per ogni evento letto, lo cancella dalla coda**

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input una coda SQS, effettua le seguenti operazioni:
1) Recupero in batch dei messaggi dalla coda SQS (batch di lunghezza 10).
2) Per ogni batch di messaggi:
   1) Scrive i messaggi all'interno di un file JSON inline
   2) Elimina i 10 messaggi della coda, se non ci sono errori. Altrimenti lo script si ferma.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile <aws-profile>
```

### Esecuzione
```bash
node dump_sqs_with_delete.js --awsProfile <aws-profile> [--region region] --queueName <queue-name> [--visibilityTimeout <visibility-timeout>] [--limit <limit-value>]
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<region>` region su cui exportare il DUMP sulla coda. Opzionale, di default è eu-south-1 (Milano);
- `<queue-name>` è il nome della coda SQS;
- `<visibility-timeout>` è il valore del visibilityTimeout nella receiveMessage verso SQS (default 60 secondi);
- `<output-format>` è il formato della coda che può assumere i valori "raw" (default) o "ss" (per post-analisi SafeStorage).
- `<limit-value>` è il limite massimo di messaggi che si vogliono estrarre dalla coda.