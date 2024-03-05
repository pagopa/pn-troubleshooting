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
node index.js --awsProfile <aws-profile> --exclusiveStartKey <exclusive-start-key> --scanLimit <scan-limit>
```

Dove:

- `<aws-profile>` è il profilo dell'account AWS;
- `<exclusive-start-key>` settare questo parametro permette di cominciare la prima scan a partire dalla primary key
  indicata; `OPZIONALE`
- `<scan-limit>` è il numero massimo di record reperibili da una singola scan; `OPZIONALE`