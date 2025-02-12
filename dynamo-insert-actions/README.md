# Utility di inserimento record per pn-Action

Questo script permette di inserire elementi nella tabella DynamoDB pn-Action previo aggiornamento del Time-To-Live (TTL) e del flag `notToHandle`.

## Prerequisiti

- Node.js installato
- Configurazione AWS CLI con le credenziali appropriate
- File CSV contenente gli ID delle azioni da aggiornare

## Struttura del File CSV

Il file CSV deve contenere le seguenti colonne:
- `actionId`: ID dell'azione da aggiornare
- `ttl`: Valore TTL attuale

## Utilizzo

```bash
node dynamo-insert-actions.js --envName|-e <ambiente> --csvFile|-f <percorso> --ttlDays|-d <giorni>
```

### Parametri

- `--envName`, `-e`: Ambiente di destinazione (dev|uat|test|prod|hotfix)
- `--csvFile`, `-f`: Percorso del file CSV contenente i dati delle azioni
- `--ttlDays`, `-d`: Numero di giorni da aggiungere al TTL attuale

### Esempio

```bash
node dynamo-insert-actions.js -e dev -f ./actions.csv -d 30
```

## Output

Lo script genera due file JSON nella cartella `results`:
- `success.json`: Contiene gli ID delle azioni aggiornate con successo
- `failure.json`: Contiene gli ID delle azioni che non è stato possibile aggiornare

## Note

- Lo script aggiorna gli elementi in batch di 25 alla volta
- Per ogni elemento, viene impostato il flag `notToHandle` a `true`
- Viene effettuata una verifica per confermare che gli aggiornamenti siano stati applicati correttamente
