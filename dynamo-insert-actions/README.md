# Utility di inserimento record per pn-Action

Questo script permette di inserire elementi nella tabella DynamoDB pn-Action previo aggiornamento del Time-To-Live (TTL) e del flag `notToHandle`.

## Prerequisiti

- Node.js installato
- Configurazione AWS CLI con le credenziali appropriate
- File CSV contenente gli ID delle azioni da aggiornare

## Struttura del File CSV

Il file CSV deve contenere le seguenti colonne:
- `actionId`: ID dell'azione da aggiornare (stringa)
- `ttl`: Valore TTL attuale (numero intero)

Nota: Le righe vuote verranno ignorate durante l'elaborazione.

## Utilizzo

```bash
node dynamo-insert-actions.js --envName|-e <ambiente> --csvFile|-f <percorso> --ttlDays|-d <giorni> [--actionId|-a <id>] [--dryRun|-r]
```

### Parametri

- `--envName`, `-e`: (Opzionale) Ambiente di destinazione, se non specificato usa 'dev' (dev|uat|test|prod|hotfix)
- `--csvFile`, `-f`: Percorso del file CSV contenente i dati delle azioni
- `--ttlDays`, `-d`: Numero di giorni da aggiungere al TTL attuale
- `--actionId`, `-a`: (Opzionale) ID dell'azione da cui iniziare l'elaborazione
- `--dryRun`, `-r`: (Opzionale) Simula l'esecuzione senza scrivere su DynamoDB
- `--help`, `-h`: Mostra il messaggio di aiuto

### Esempi

```bash
# Elaborazione completa del file
node dynamo-insert-actions.js -e dev -f ./actions.csv -d 30

# Elaborazione a partire da uno specifico actionId
node dynamo-insert-actions.js -e dev -f ./actions.csv -d 30 -a "action_123"

# Simulazione senza modifiche effettive
node dynamo-insert-actions.js -e dev -f ./actions.csv -d 30 --dryRun
```

## Output

Lo script produce due tipi di output:
- **Console**: 
  - Mostra in tempo reale il numero di record elaborati
  - Fornisce un riepilogo finale dell'esecuzione
  - In caso di errore, mostra l'actionId da cui riprendere l'elaborazione
- **File**: 
  - `results/failure.json`: Contiene i dettagli degli errori riscontrati

## Note

- Lo script elabora gli elementi in batch di 25 alla volta
- Per ogni elemento viene:
  - Aggiornato il TTL aggiungendo i giorni specificati
  - Impostato il flag `notToHandle` a `true`
- L'elaborazione si interrompe al primo errore riscontrato
- In caso di errore SSO, lo script fornisce istruzioni per il rinnovo delle credenziali
