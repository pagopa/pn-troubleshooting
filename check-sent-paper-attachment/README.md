# check-sent-paper-attachment

Script di verifica stato di invio dei PN_PAPER_ATTACHMENT.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Preparazione](#preparazione)
  * [Esecuzione](#esecuzione)

## Descrizione

Lo script esegue le seguenti operazioni:

1. Legge in input il dump dei messaggi dalle code, come prelevati dallo script [dump_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_sqs):
   * `pn-ss-transformation-raster-queue-DLQ`
   * `pn-ec-availabilitymanager-queue-DLQ`
2. Per ogni messaggio:
   * Estrae la chiave del file dal messaggio
   * Cerca nei log di pn-external-channel per trovare il cx_id associato
   * Verifica nella tabella `pn-EcRichiesteMetadati` se la richiesta ha raggiunto lo stato 'sent'

I messaggi processati dal dump vengono infine suddivisi nei seguenti file di output:

* `results/need_further_analysis_${queueName}_${date}.json`: messaggi che non hanno superato il controllo, con dettagli sul controllo non superato
* `results/safe_to_delete_${queueName}_${date}.json`: messaggi che hanno superato il controllo e che possono essere rimossi dalla DLQ

## Installazione

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
* `<path>` è il percorso al file JSON contenente i messaggi da analizzare

Al termine dell'esecuzione viene mostrato un riepilogo con:

* Numero totale di messaggi processati
* Numero di messaggi che hanno superato i controlli
* Numero di messaggi che non hanno superato i controlli
