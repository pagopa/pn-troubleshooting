# Richieste_metadati_data_cleaning

Script per la bonifica dei dati contenuti nella tabella pnEc-RichiesteMetadati.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il package contiene uno script atto alla bonifica dei requestMetadata.
La bonifica consiste nell'inserire in ogni record il nuovo attributo "lastUpdateTimestamp"
e in ogni evento della lista "eventsList" l'attributo "insertTimestamp".

## Installazione

```bash
npm install
```

## Utilizzo

### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione

```bash
node index.js --awsProfile <aws-profile> --exclusiveStartKey <exclusive-start-key> --scanLimit <scan-limit> --test --dryrun
```

Dove:

- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di sistema; `OPZIONALE`
- `<exclusive-start-key>` settare questo parametro permette di cominciare la prima scan a partire dalla primary key
  indicata. Se non inserito, la prima scan partirà dall'inizio della tabella; `OPZIONALE`
- `<scan-limit>` è il numero massimo di record reperibili da una singola scan. Come default, vengono reperiti record
  fino a che non viene raggiunta la soglia massima (definita da AWS) di 1MB per singola scan. `OPZIONALE`
- `<test>` se inserito, attiva la modalità test. In questa modalità, viene eseguita una singola scan di 10 record dalla
  tabella. `OPZIONALE`
- `<dryrun>` se inserito, attiva la modalità dryrun. Questa modalità attiva automaticamente anche quella di test, e in piu'
disattiva le operazioni di scrittura. `OPZIONALE`

Alla fine del processo di bonifica, verrà generato un file _"failures.csv"_ contenente i requestId dei record
su cui l'update è andato in eccezione e la causa dell'errore.

Se è attiva la modalità test, verrà anche generato un file _"test-records.csv"_ contenente i requestId dei record
che sono stati aggiornati.