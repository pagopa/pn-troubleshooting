## Redrive Event from DLQ to Kinesis Stream

Installare dipendenze node:
`npm install` 

Salvare nel file `event.json` l'evento che si vuole pubblicare sullo stream kinesis

Eseguire il comando:
`node put_dlq_event_to_kinesis.js <aws-profile> <kinesis-stream-arn>`

Dove `<aws-profile>` è il profilo dell'account AWS e `<kinesis-stream-arn>` é l'ARN dello stream kinesis sul quale si vuole pubblicare l'evento.

Note: 

1) lo script esegue la put di un evento allo stream kinesis identificato dal suo ARN.

2) lo script viene eseguito sempre nella region `eu-south-1` 

