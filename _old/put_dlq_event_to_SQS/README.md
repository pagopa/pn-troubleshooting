# Redrive Event from DLQ to SQS

Script di redrive di un evento da una DLQ ad una cosa SQS

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input una coda DLQ, una coda di destinazione e `<messageId>`, effettua le seguenti operazioni:
1) Recupero messaggi dalla DLQ.
2) Individua il messaggio con il messageId passato in input.
3) Effettua il redrive del messaggio sulla coda di destinazione.
4) Elimina il messaggio dalla DLQ.

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

### Esecuzione
```bash
node put_dlq_event_to_sqs.js --awsProfile <aws-profile> --dlqName <DLQName> --destinationQueueName <SQSName> --idMessage <MessageID>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<MessageID>` é l'id del messaggio presente in DLQ recuperabile da console AWS (inserire *ALL* per fare il redrive di tutti i messaggi).
- `<DLQUrl>` è il nome della DLQ in oggetto.
- `<SQSUrl>` è il nome della coda di destinazione del redrive.