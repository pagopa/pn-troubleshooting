# Redrive of paper workflow failed

Script di sblocco delle notifiche nel flusso analogico.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input un requestId, sostituisce in tabella "pn-PaperRequestError" il `<requestId>` con `<requestId>_TMP`.
Effettua l'invio del messaggio nella coda SQS `pn-paper_channel_requests` in due versioni V1 e V2. (TO_UPDATE)

***ATTENZIONE***

Lo script è altamente invasivo. Quindi procedere solo se si ha le competenze tecniche necessarie.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione singolo RequestId
```bash
node redrive_paper_events.js --awsCoreProfile <aws-profile-core> --awsConfinfoProfile <aws-profile-confinfo> --requestId <request-id>

```
Dove:
- `<aws-profile-core>` è il profilo dell'account AWS core;
- `<aws-profile-confinfo>` è il profilo dell'account AWS confinfo;
- `<request-id>` è il request id del messaggio desiderato.


Note: per eseguirlo iterativamente a partire dal dump della tabella pn-PaperRequestError eseguire il seguente script:
```bash
for i in $(jq -r '.[] | select(.error.S=="<ERROR>")' <dynamodb-dump-file-path> | jq -r '.requestId.S'); do
    node redrive_paper_event.js --awsCoreProfile <aws-profile-core> --awsConfinfoProfile <aws-profile-confinfo> --requestId $i;
    sleep 5;
done
```

### Esecuzione lista massiva requestId
```bash
node redrive_paper_events_massive.js --awsCoreProfile <aws-profile-core> --awsConfinfoProfile <aws-profile-confinfo> --file <file-path>

```
Dove:
- `<aws-profile-core>` è il profilo dell'account AWS core;
- `<aws-profile-confinfo>` è il profilo dell'account AWS confinfo;
- `<file-path>` è il path di un file csv con la lista dei requestId da processare (una sola colonna).
