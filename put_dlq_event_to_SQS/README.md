## Redrive Event from DLQ to SQS

Per poter avviare lo Script eseguire gli steps:

Installare dipendenze node:
`npm install`

Eseguire il comando:
`node put_dlq_event_to_sqs.js <aws-profile> <DLQName> <SQSName> <MessageID>`

Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<MessageID>` é l'id del messaggio presente in DLQ recuperabile da console AWS (inserire *ALL* per fare il redrive di tutti i messaggi).
- `<DLQUrl>` è il nome della DLQ in oggetto.
- `<SQSUrl>` è il nome della coda di destinazione del redrive.

Note: 
Lo Script, dato in input una coda DLQ, una coda di destinazione e messageId, effettua le seguenti operazione:
1) Recupero messaggi dalla DLQ.
2) Individua il messaggio con il messageId passato in input.
3) Effettua il redrive del messaggio sulla coda di destinazione.
4) Elimina il messaggio dalla DLQ.
