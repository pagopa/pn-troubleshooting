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

### replace_certificate
Vuoi fare un backup dei certificati o sostituire i certificati attuali con quelli nuovi? 
```bash
node index.js --envName <env-Name> --certificate <ade|infocamere> [--replace]
```


### cognito_reset_password
Vuoi resettare la password ad un utente cognito?
```bash
./reset-cognito-pwd.sh -r <aws-region> -p <aws-profile> -x <new-password> -e <email> -c <cognito-user-pool>
```

### legal_conservation_retry
Vuoi ritrasmettere un documento in conservazione sostitutiva?
```bash
./index.sh -r <aws-region> -p <aws-profile> -f <json-file> [-i <invoke>]
```

### legal_conservation_retry
Vuoi estrarre tutti i file in errore in conservazione sostitutiva?
```bash
./node index.js --envName <env-name> --startDate <startDate> [--endDate <endDate>]
```

### dump_sqs
Vuoi eseguire il dump di una coda SQS?
```bash
node dump_sqs.js --awsProfile <aws-profile> --queueName <queue-name> --visibilityTimeout <visibility-timeout> [--format <output-format> --limit <limit-value> --remove]
```

### generate_jws
Vuoi generare un JWS per InfoCamere?
```bash
./node index.js <aws-profile> <client-id>
```

### check_ec_events
Vuoi verificare se gli eventi su external-channel sono eventi duplicati?
```bash
node index.js --awsProfile <aws-profile> --fileName <file-name>
```

### put_event_to_SQS
Vuoi inviare eventi a partire da un file su una coda SQS?
```bash
node index.js --profile <profile> --queueUrl <queueUrl> --fileName <fileName> [--from [dump_sqs|ec_events]]
```

### timelines_from_iuns
Script Python per ottenere timelines da una lista di IUN
```bash
python3 ./timelines_from_iuns.py iuns.txt timelines.json --profile <aws-profile>
```

### dynamo_db_load_batch
Vuoi inserire dati in una tabella dynamo a partire da un file?
```bash
node index.js --profile <profile> --tableName <tableName> --fileName <fileName> [--batchDimension <batchDimension]
```

### compare-config
Vuoi comparare le configurazioni tra due ambienti?
```bash
node index.js <envA>  <envB>  <pnConfigurationPath>
```

### check_backup_dynamodb
Vuoi rigenerare il file di backup delle tabelle dynamo in base agli aggiornamenti?
```bash
node index.js --envName <envName> --folderPath <folderPath>
```