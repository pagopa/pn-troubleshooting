# Richieste_metadati_data_cleaning

Script per la bonifica dei dati contenuti nella tabella pnEc-RichiesteMetadati.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)
- [Testing](#testing)

## Descrizione

Il package contiene due script atti alla bonifica dei requestMetadata.

### index.js
La bonifica consiste nell'inserire in ogni record il nuovo attributo "lastUpdateTimestamp"
e in ogni evento della lista "eventsList" l'attributo "insertTimestamp".

### lastUpdateTimestamp-future.js
La bonifica consiste nella verifica del valore dell'attributo "lastUpdateTimestamp" di ogni record.
Se il valore è impostato nel futuro, viene aggiornato con la data corrente.

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
node index.js --awsProfile <aws-profile> --exclusiveStartKey <exclusive-start-key> --scanLimit <scan-limit> --requestIdsPath <request-ids-path> --test --dryrun
```

Dove:

- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di
  sistema; `OPZIONALE`
- `<exclusive-start-key>` settare questo parametro permette di cominciare la prima scan a partire dalla primary key
  indicata. Se non inserito, la prima scan partirà dall'inizio della tabella; `OPZIONALE`
- `<scan-limit>` è il numero massimo di record reperibili da una singola scan. Come default, vengono reperiti record
  fino a che non viene raggiunta la soglia massima (definita da AWS) di 1MB per singola scan. `OPZIONALE`
- `<request-ids-path>` indica il path di un file contenente delle requestId. Se inserito, attiva il metadata cleaning
  SOLO per le requestId indicate. Questa modalità non prevede scan della tabella. `OPZIONALE`
- `<test>` se inserito, attiva la modalità test. In questa modalità, viene eseguita una singola scan di 10 record dalla
  tabella. `OPZIONALE`
- `<dryrun>` se inserito, attiva la modalità dryrun. Questa modalità disattiva le operazioni di scrittura. `OPZIONALE`
  Alla fine del processo di bonifica, verrà generato un file _"failures.csv"_ contenente i requestId dei record
  su cui l'update è andato in eccezione e la causa dell'errore.

Se è attiva la modalità test, verrà anche generato un file _"test-records.csv"_ contenente i requestId dei record
che sono stati aggiornati.

Se è attiva la modalià dryrun, verrà generato un file _"dryrun-updated.csv"_ contenente i requestId dei record che sarebbero stati aggiornati.

## Testing

Il package contiene anche uno script di setup per creare dei record appositi per i test.

```bash
node data-setup.js --awsProfile <aws-profile> --digitalRecordsNum <num1 num2 num3> --paperRecordsNum <num1 num2 num3>
```

- `awsProfile` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di
  sistema; `OPZIONALE`
- `digitalRecordsNum` è un array di numeri che indica il numero di request digitali da creare per ogni tipologia di entry.
- `paperRecordsNum` è un array di numeri che indica il numero di request cartacee da creare per ogni tipologia di entry.

Le tipologie di entry sono, in ordine di posizionamento nell'array, queste tre:

1) Record **NON** da sanare.
2) Record con lastUpdateTimestamp e insertTimestamp mancanti.
3) Record con lastUpdateTimestamp presente ma alcuni eventi vecchi da sanare.

