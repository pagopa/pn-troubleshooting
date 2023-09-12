# pn-troubleshooting

PN-troubleshooting contiene una serie di script utili costruiti adhoc dagli sviluppatori di PN per velocizzare il processo di diagnostica e risoluzione dei problemi.

## Tabella dei Contenuti

- [Scripts](#scripts)

## Scripts

### put_dlq_event_to_SQS
Vuoi fare un redrive di un messaggio/evento da una coda DLQ ad una SQS?
```bash
node put_dlq_event_to_sqs.js --awsProfile <aws-profile> --dlqName <DLQName> --destinationQueueName <SQSName> --idMessage <MessageID>
```

### put_dlq_event_to_kinesis
Vuoi pubblicare un evento su uno stream kinesis?
```bash
node put_dlq_event_to_kinesis.js --awsProfile <aws-profile> --arnStream <kinesis-stream-arn>
```

### redrive_paper_event
Vuoi fare il redrive di un evento cartaceo a partire da un requestId?
```bash
node redrive_paper_events.js --awsCoreProfile <aws-profile-core> --awsConfinfoProfile <aws-profile-confinfo> --requestId <request-id>
```

### scan_dynamoDB
Vuoi fare una scan su una tabella DynamoDB?
```bash
node scan_dynamo.js --awsProfile <aws-profile> --tableName <dynamodb-table>
```

### refuse_invalid_timelines
Vuoi rifiutare una notifica bloccata che non è stata ancora validata?

#### Script 1: partenza da FutureAction
```bash
npm run from-future-action
```

#### Script 2: partenza da ProgressionSensor
```bash
npm run from-progression-sensor
```

### get_paper_error_details
Vuoi fare una scan su tutte le informazioni relative ad un requestId di un invio Analogico in formato JSON?
```bash
node index.js --awsCoreProfile <aws-core-profile> --awsConfinfoProfile <aws-confinfo-profile> --requestId <request-id>
```

### edit_paper_address
Vuoi generare la codifica di un receiver address di un invio analogico mediante requestId? Campi generati da inserire in pn-paper-address e pn-paper-request-delivery 
```bash
node index.js --awsCoreProfile <aws-core-profile> --envType <env-type> --requestId <request-id>
```

### data_extractor
Vuoi estrarre dei log o degli eventi in base ad input, allarmi o richieste effettuate?
```bash
node ./src/index.js --envName <env-name> --alarm|--input|--url <alarm>|<input>|<url> [--start \"<start>\" --logGroups \"<logGroups>\" --traceId <traceId> --limit <limit>]
```

### check_certificate
Vuoi verificare la scadenza dei certificati di un ambiente?
```bash
node index.js --envName <env-Name>
```