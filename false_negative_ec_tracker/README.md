# False Negative EC Tracker DLQ

Script di analisi dei messaggi nelle DLQ di errori dal Tracker di External Channel.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
  * [Prerequisiti](#prerequisiti)
* [Utilizzo](#utilizzo)
  * [Preparazione](#preparazione)
  * [Esecuzione](#esecuzione)

## Descrizione

Gli eventi dalla DLQ vengono analizzati in base allo stato del `requestId` sulla `pn-EcRichiesteMetadati`:

**Cartaceo** (`pn-ec-tracker-cartaceo-errori-queue-DLQ.fifo`):

1. Legge in input il dump dei messaggi dalla coda DLQ come prelevati dallo script [dump_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_sqs)
2. Per ogni messaggio:
   * Estrae il `requestId`
   * Verifica lo stato finale della richiesta sulla `pn-EcRichiesteMetadati`
   * Se lo stato finale è uno fra `RECRS006`, `RECRN006`, `RECAG004`, `RECRI005`, `RECRSI005`, `RECRS013`, `RECRN013`, `RECAG013`, `PN999`, l'evento può essere rimosso dalla DLQ, altrimenti viene considerato `toKeep`
   * Se lo stato finale è un `CON020`, l'evento viene classificato come `problemFound`
   * Se si verificano errori nel processamento del messaggio o nella richiesta a DynamoDB, l'evento viene inserito fra gli `error`

**SMS** (`pn-ec-tracker-sms-errori-queue-DLQ.fifo`) o **email** (`pn-ec-tracker-email-errori-queue-DLQ.fifo`):

1. Legge in input il dump dei messaggi dalla coda DLQ
2. Per ogni messaggio:
   * Estrae il `requestId`
   * Verifica gli eventi (`eventsList`) della richiesta sulla `pn-EcRichiesteMetadati`
   * Se sono presenti eventi `digProgrStatus` negli stati *booked* e *sent*, l'evento può essere rimosso dalla DLQ, altrimenti viene considerato `toKeep`
   * Il caso specifico in cui sono presenti gli stati *booked* e *sent* ma non c'è corrispondenza fra l'attributo DynamoDB `statusRequest` ed il campo `nextStatus` nel messaggio JSON viene classificato come `problemFound`
   * Se si verificano errori nel processamento del messaggio o nella richiesta a DynamoDB, l'evento viene inserito fra gli `error`

**PEC** (`pn-ec-tracker-pec-errori-queue-DLQ.fifo`):

1. Legge in input il dump dei messaggi dalla coda DLQ
2. Per ogni messaggio:
   * Estrae il `requestId`
   * Verifica gli eventi (`eventsList`) della richiesta sulla `pn-EcRichiesteMetadati`
   * Se sono presenti eventi `digProgrStatus` negli stati *booked*, *sent*, *accepted* e uno fra *delivered* o *notDelivered*, l'evento può essere rimosso dalla DLQ, altrimenti viene considerato `toKeep`
   * Il caso specifico in cui sono presenti gli stati *booked*, *sent*, *accepted* e uno fra *delivered* o *notDelivered* ma non c'è corrispondenza fra l'attributo DynamoDB `statusRequest` ed il campo `nextStatus` nel messaggio JSON viene classificato come `problemFound`
   * Se si verificano errori nel processamento del messaggio o nella richiesta a DynamoDB, l'evento viene inserito fra gli `error`

I messaggi processati dal dump vengono infine suddivisi nei seguenti file di output a seconda della classificazione in seguito all'analisi:

* `results/to_remove_${channelType}_${timestamp}.json`
* `results/to_keep_${channelType}_${timestamp}.json`
* `results/error_${channelType}_${timestamp}.json`
* `results/problem_found_${channelType}_${timestamp}.json`

## Installazione

### Prerequisiti

Lo script è stato testato con Node LTS v22.14.0

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
node index.js --envName <env> --dumpFile <path> --queueName <queue>
```

oppure

```bash
node index.js -e <env> -f <path> -q <queue>
```

Dove:

* `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
* `<path>` è il percorso al file JSON contenente i messaggi DLQ da analizzare
* `<queue>` è il nome della coda DLQ da analizzare, deve essere uno tra:
  * `pn-ec-tracker-pec-errori-queue-DLQ.fifo`
  * `pn-ec-tracker-sms-errori-queue-DLQ.fifo`
  * `pn-ec-tracker-email-errori-queue-DLQ.fifo`
  * `pn-ec-tracker-cartaceo-errori-queue-DLQ.fifo`

Esempi:

Per analizzare messaggi dalla `pn-ec-tracker-pec-errori-queue-DLQ.fifo`:

```bash
node index.js -e dev -f ./dump.json -c pec
```

Per analizzare messaggi dalla `pn-ec-tracker-sms-errori-queue-DLQ.fifo`:

```bash
node index.js -e dev -f ./dump.json -c sms
```

Per analizzare messaggi dalla `pn-ec-tracker-email-errori-queue-DLQ.fifo`:

```bash
node index.js -e dev -f ./dump.json -c email
```

Per analizzare messaggi dalla `pn-ec-tracker-cartaceo-errori-queue-DLQ.fifo`:

```bash
node index.js -e dev -f ./dump.json -c cartaceo
```
