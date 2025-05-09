# prepare_check_attachment_retention

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script, dato in input un file JSON inline ottenuto come output dallo script [retrieve_attachments_from_iuns](https://github.com/pagopa/pn-troubleshooting/tree/ops/GO-153/retrieve_attachments_from_iun); per ogni IUN:
- verifica la presenza di eventuali Delete Marker associati agli allegati(attachments) della notifica e, se esistono:
  - li elimina rendendo il documento nuovamente disponibile sul main bucket S3 di Safe Storage;
  - nella tabella "pn-SsDocumenti" aggiorna il campo "documentState" con il valore "attached"; 
- nella tabella "pn-FutureAction", tramite l'indice "iun-index", recupera timeslot e actionId associati allo IUN;
- nella tabella "pn-FutureAction" e per ogni coppia timeSlot/actionId identificata al punto precedente, verifica la presenza di item per i quali l'attributo type = "CHECK_ATTACHMENT_RETENTION":
  - se esiste, allo stesso item verrà aggiunto l'attributo "logicalDeleted = true";
- in un file di output verrà generato un JSON inline che può essere risottomesso, tramite lo script [put_msgs_to_SQS](https://github.com/pagopa/pn-troubleshooting/tree/main/put_msgs_to_SQS), nella coda SQS pn-delivery_push_actions.
	

## Installazione

```bash
npm install
```

## Utilizzo

```bash

node index.js \
	[--region region] \
	--env <dev|test|uat|hotfix|prod> \
	--fileName <output file retrieve_attachments_from_iuns> \
	[--startIun <iun>]

```

Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- fileName: è il file di output generato dallo script retrieve_attachments_from_iuns;
- startIun: è lo IUN di partenza. Se questo parametro non è definito lo script elaborerà tutti gli IUN presenti nel file JSON inline.
