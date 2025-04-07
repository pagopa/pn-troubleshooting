# check-sent-paper-attachment

Script di verifica stato di invio dei PN_PAPER_ATTACHMENT.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
  * [Prerequisiti](#prerequisiti)
* [Utilizzo](#utilizzo)
  * [Preparazione](#preparazione)
  * [Esecuzione](#esecuzione)
  * [Formato Output](#formato-output)

## Descrizione

Lo script esegue le seguenti operazioni:

1. Legge in input il dump dei messaggi dalle code, come prelevati dallo script [dump_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_sqs):
   - `pn-ss-transformation-raster-queue-DLQ`
   - `pn-ec-availabilitymanager-queue-DLQ` 
2. Per ogni messaggio:
   - Estrae la chiave del file dal messaggio
   - Cerca nei log di pn-external-channel per trovare il cx_id associato
   - Verifica nella tabella `pn-EcRichiesteMetadati` se la richiesta ha raggiunto lo stato 'sent'

I risultati delle verifiche vengono salvati in due file con data nel formato YYYY-MM-DD:
- `results/to_keep_<data>.json` per i messaggi che non hanno superato il controllo
- `results/to_remove_<data>.json` per i messaggi che hanno superato il controllo e che possono essere rimossi dalla DLQ

## Installazione

### Prerequisiti

Lo script è stato testato con Node LTS v22.13.0 e richiede versione minima v16.0.0

```bash
npm install
```

## Utilizzo

### Preparazione

```bash
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione

```bash
node index.js --envName <env> --dumpFile <path>
```
oppure
```bash
node index.js -e <env> -f <path>
```

Dove:
- `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
- `<path>` è il percorso al file JSON contenente i messaggi da analizzare

### Formato Output

Per i messaggi che risultano correttamente inviati, il file `to_remove_<data>.json` contiene una riga per messaggio nel formato:
```json
{"MD5OfBody": "abc123", "MD5OfMessageAttributes": "xyz789"}
```

Per i messaggi che non risultano correttamente inviati, il file `to_keep_<data>.json` contiene una riga per messaggio nel formato:
```json
{
    "fileKey": "path/to/file",
    "requestId": "pn-cons-000~uuid",
    "failureReason": "motivo del fallimento"
}
```

Al termine dell'esecuzione viene mostrato un riepilogo con:
- Numero totale di messaggi processati
- Numero di messaggi che hanno superato i controlli
- Numero di messaggi che non hanno superato i controlli