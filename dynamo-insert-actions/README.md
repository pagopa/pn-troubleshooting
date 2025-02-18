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
node dynamo-insert-actions.js --envName|-e <ambiente> --csvFile|-f <percorso> --ttlDays|-d <giorni> [--actionId|-a <id>]
```

### Parametri

- `--envName`, `-e`: Ambiente di destinazione (dev|uat|test|prod|hotfix)
- `--csvFile`, `-f`: Percorso del file CSV contenente i dati delle azioni
- `--ttlDays`, `-d`: Numero di giorni da aggiungere al TTL attuale
- `--actionId`, `-a`: (Opzionale) ID dell'azione da cui iniziare l'elaborazione

### Esempi

```bash
# Elaborazione completa del file
node dynamo-insert-actions.js -e dev -f ./actions.csv -d 30

# Elaborazione a partire da uno specifico actionId
node dynamo-insert-actions.js -e dev -f ./actions.csv -d 30 -a "action_123"
```

## Output

Lo script produce due tipi di output:
- **Console**: Mostra in tempo reale gli actionId elaborati con successo
- **File**: Genera `results/failure.json` contenente gli eventuali errori riscontrati

## Note

- Lo script aggiorna gli elementi in batch di 25 alla volta
- Per ogni elemento, viene impostato il flag `notToHandle` a `true`
- Lo script si interrompe al primo errore riscontrato durante l'elaborazione
- Viene effettuata una verifica per confermare che gli aggiornamenti siano stati applicati correttamente
