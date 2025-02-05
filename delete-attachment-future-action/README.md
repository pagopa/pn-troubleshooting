# Delete Attachment Future Action

Script per la gestione logica delle future action di ritenzione allegati.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Esecuzione](#esecuzione)
  * [Formato Output](#formato-output)

## Descrizione

Lo script esegue le seguenti operazioni:

1. Legge in input il dump dei messaggi dalla coda DLQ `pn-delivery_push_actions-DLQ` come prelevati dallo script [dump_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_sqs)
2. Per ogni messaggio di tipo `CHECK_ATTACHMENT_RETENTION`:
   - Estrae lo IUN dal messaggio
   - Verifica nella tabella `pn-Timelines` la presenza di eventi con categoria REFINEMENT, NOTIFICATION_VIEWED o NOTIFICATION_CANCELLED
   - Se trovati, aggiorna le azioni future nella tabella `pn-FutureAction` impostando logicalDeleted a true per quelle che iniziano con "check_attachment_retention_iun"

I messaggi elaborati vengono salvati in un file JSON contenente gli MD5 necessari per la successiva rimozione dalla coda DLQ.

## Installazione

```bash
npm install
```
## Utilizzo

### Esecuzione
```bash
node delete-attachment-future-action.js --envName <env> --dumpFile <path> --resultPath <path>
```
oppure
```bash
node delete-attachment-future-action.js -e <env> -f <path> -r <path>
```
Dove:

- `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
- `<dumpFile>` è il percorso al file JSON contenente i messaggi DLQ filtrati
- `<resultPath>` è il percorso dove salvare il file dei risultati

### Formato Output

Il file di output contiene una riga per ogni messaggio elaborato nel formato:
```json
{"MD5OfBody": "abc123", "MD5OfMessageAttributes": "xyz789"} 
```
oppure, se non sono presenti attributi:
```json
{"MD5OfBody": "def456"}
```
### Statistiche di Esecuzione
Al termine dell'elaborazione viene mostrato un riepilogo con:

- Numero totale di messaggi processati
- Numero di messaggi che hanno richiesto aggiornamenti
- Numero di messaggi ignorati
- Percorso del file di output
