# Utility di inserimento record per pn-Action

Questo script permette di inserire elementi nella tabella DynamoDB pn-Action previo aggiornamento del Time-To-Live (TTL) e del flag `notToHandle`.

## Prerequisiti

- Node.js installato
- Configurazione AWS CLI con credenziali SSO appropriate
- File CSV contenente gli ID delle azioni da aggiornare

## Struttura del File CSV

Il file CSV deve contenere le seguenti colonne:
- `actionId`: ID dell'azione da aggiornare (stringa)
- `ttl`: Valore TTL attuale (numero intero, opzionale)

Note: 
- Se il TTL non è presente o non è valido, verrà utilizzato il timestamp corrente
- Le righe vuote verranno ignorate durante l'elaborazione

## Utilizzo

```bash
node index.js --envName|-e <ambiente> --csvFile|-f <percorso> --ttlDays|-d <giorni> [--actionId|-a <id>] [--dryRun|-r]
```

### Parametri

- `--envName`, `-e`: (Opzionale) Ambiente di destinazione (dev|uat|test|prod|hotfix)
- `--csvFile`, `-f`: (Obbligatorio) Percorso del file CSV contenente i dati delle azioni
- `--ttlDays`, `-d`: (Obbligatorio) Numero di giorni da aggiungere al TTL attuale
- `--actionId`, `-a`: (Opzionale) ID dell'azione da cui iniziare l'elaborazione
- `--dryRun`, `-r`: (Opzionale) Simula l'esecuzione senza scrivere su DynamoDB
- `--help`, `-h`: Mostra il messaggio di aiuto

### Esempi

```bash
# Elaborazione completa del file
node index.js -e dev -f ./actions.csv -d 30

# Elaborazione a partire da uno specifico actionId
node index.js -e dev -f ./actions.csv -d 30 -a "action_123"

# Simulazione senza modifiche effettive
node index.js -e dev -f ./actions.csv -d 30 --dryRun
```

## Processo di Elaborazione

Lo script:
1. Valida i parametri di input e le credenziali SSO
2. Elabora il file CSV in streaming
3. Raggruppa le operazioni in batch da 25 elementi
4. Per ogni batch:
   - Esegue la scrittura su DynamoDB
   - Attende 5ms prima del batch successivo
   - In caso di elementi non processati:
     - Attende 30ms prima di riprovare
     - Effettua fino a 3 tentativi di riesecuzione
5. Registra eventuali errori nei file di output
6. Produce un riepilogo dell'esecuzione

## Output

### Console
- Progresso in tempo reale
- Riepilogo finale con:
  - Totale elementi processati
  - Elementi aggiornati con successo
  - Elementi falliti
  - Metriche di performance (tempo, memoria, CPU)
  - In caso di errore: actionId da cui riprendere

### Output
- `failure.json`: Log dettagliato degli errori
- `failure.csv`: Elenco degli actionId falliti con relativi TTL

I file vengono scritti sotto:

- `/results/YYYY-MM-DD_HH-mm-ss/envName/`
- `/results/YYYY-MM-DD_HH-mm-ss/`

a seconda che l'ambiente destinazione (envName) sia stato passato o meno in input.

## Gestione Errori

- Validazione iniziale dei parametri
- Verifica delle credenziali SSO con istruzioni di ripristino
- Retry automatico per elementi non processati
- Possibilità di ripresa dell'elaborazione da un specifico actionId
