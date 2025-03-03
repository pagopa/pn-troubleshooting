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

### get-pnPaperError
Vuoi recuperare i requestId della table pn-paperError in base ad un filtro?
```bash
node scan_dynamo.js --awsProfile <aws-profile> --tableName <dynamodb-table> --filter <filter>
```

### redrive-pnPaperError
Vuoi risottomettere gli eventi recuperati da get-pnPaperError?
```bash
node index.js --envName <envName> --fileName <fileName>
```

### compare-conf-environment
Vuoi comparare le configurazioni tra due ambienti?
```bash
node index.js <envA>  <envB>  <pnConfigurationPath>
```

### check_backup_dynamodb
Vuoi rigenerare le informazioni da inserire nei file di backup delle tabelle dynamo in base agli aggiornamenti?
```bash
node index.js --envName <envName> --folderPath <folderPath>
```

### check_pec_events
Vuoi verificare se un requestId di una PEC contiene tutti gli eventi previsti?
```bash
node index.js --envName <envName> --fileName <fileName>
```

### retrieve_glacier_s3
Vuoi effettuare delle richieste di recupero su glacier tramite file in input per una serie di documenti?
```bash  
node index.js --envName <envName> --fileName <fileName> [--expiration <expiration> --tier <tier>]
```

### check_pec_events
Vuoi verificare se un requestId di una PEC contiene tutti gli eventi previsti?
```bash
node index.js --envName <envName> --fileName <fileName>
```

### sla_violations_start_workflow
Vuoi avviare il workflow di notifiche per le quali non è stato consegnato l'evento sul DynamoDB Stream?
```bash  
node index.js --awsCoreProfile <aws-profile> --file <json-file>
```

### retrieve_sender_CON996
Vuoi recuperare informazioni riguardanti la PA mittente di uno IUN?
```bash  
node index.js --envName <envName> --fileName <fileName>
```

### retrieve_iun_from_file
Vuoi recuperare gli iun e Sender Denomination di una lista di filename?
```bash  
node index.js --envName <envName> --fileName <fileName> [--timing]
```

### increase_doc_retention_for_late_notifications
Vuoi allungare la retention degli allegati di una o più notifiche? 
```bash  
node index.js --envName <envName> --directory <directory> [--delayOffset <delayOffset>] [--scheduleAction]
```

### retrieve_taxid_by_ipacode
Vuoi recuperare i taxid per una lista di ipacode fornita?
```bash  
node index.js --fileNameIpa <fileNameIpa> --fileNameDump <fileNameDump>
```

### verify_ss_file_events
Vuoi verificare che un file abbia seguito il corretto flusso di eventi in safestorage?
```bash  
node index.js --envName <envName> --fileName <fileName> 
```

### redrive_prepare_analog
Vuoi reinviare eventi che sono bloccati con evento RECAG012?
```bash  
node index.js --envName <envName> --fileName <fileName> [--dryrun]
```

### retrieve_attachments_from_iun
Vuoi recuperare tutti gli attachments a partire da una lista di iun?
```bash  
node index.js --envName <envName> --fileName <fileName> 
```

# prepare_certificates_package
Vuoi generare i file con i certificati da fornire ad AdE e InfoCamere?
```bash  
./index.sh <envName>
```

# false_negative_paper_error
Vuoi rimuovere da pn-ec-tracker-cartaceo-errori-queue-DLQ.fifo i falsi negativi?
```bash
node index.js --envName <envName> --fileName <fileName> [--dryrun]
```

### retrieve_attachments_from_requestId
Vuoi recuperare tutti i documenti allegati ad un requestId?
```bash  
node index.js --envName <envName> --fileName <fileName> 
```

### tech_stop_analog_notification
Vuoi bloccare una notifica in stato PN999 nel flusso cartaceo?
```bash  
node index.js --envName <envName> --fileName <fileName> 
```

### tech_stop_analog_notification_unlock
Vuoi sbloccare una notifica in stato PN999 impostando un P000 nel flusso cartaceo?
```bash  
node index.js --envName <envName> --fileName <fileName> [--dryrun]
```

### remove_from_paper_error
Vuoi rimuovere dalla tabella pn-paperRequestError dei requestId?
```bash  
node index.js --envName <envName> --fileName <fileName> [--dryrun] 
```

### verify_if_exist_or_stolen
Vuoi verificare se un requestId è stato scartato e il suo tentativo precedente è in uno stato di furto?
```bash
node index.js --envName <envName> --fileName <fileName>
```

### redrive_prepare_analog_start_event
Vuoi sottomettere un evento di prepare_analog_domicile per riavviare il flusso iniziale?
```bash
node index.js --envName <envName> --fileName <fileName> [--dryrun]
```

### dump_sla_violation
Vuoi recuperare tutte le notifiche che hanno violato una determinata tipologia di SLA?
```bash
node index.js --awsProfile <awsProfile> --slaViolation <slaViolation>"
```

### retrieve_info_sender_from_requestId
Vuoi recuperare senderId, PA mittente e notificationSentAt di una serie di requestId?
```bash
node index.js --envName <envName> --fileName <fileName>"
```

### diff_document_template
Vuoi verificare se ci sono state delle modifiche nei template della generazione dei documenti?
```bash
node index.js --from <from> -to <to> [--files]
```

### check_radd_info
Vuoi recuperare informazioni relative ad un soggetto RADD?
```bash
node index.js --envName <envName> --cf <fiscalcode> --operationId <operation-id> 
```

### check_feedback_from_requestId
Vuoi recuperare informazioni relative agli eventi presenti in pn-external-channel-to-paper-channel-DLQ?
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### check_status_request
Vuoi conoscere lo statusRequest di determinati requestId ed avere un riepilogo?
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### find_timeline_elementId
Vuoi individuare e clusterizzare i timeline elementId di una lista di iun?
```bash
node index.js --fileName <file-name> --categories <category1,category2,...> [--outputFolder <output-folder>]
```

### check_ttl_expiration
Vuoi verificare il ttl in pn-PaperAddress dei requestId?
```bash
node index.js --envName <env-name> --fileName <file-name> [--expires <expires>]
```

### extend_ttl_expiration
Vuoi modificare il ttl in pn-PaperAddress dei requestId?
```bash
node index.js --envName <env-name> --fileName <file-name> --days <days>
```

### remove_from_sqs
Vuoi rimuovere singoli eventi da una coda?
```bash
node index.js --account <account> --envName <env-name> --queueName <queue-name> --visibilityTimeout <visibility-timeout> --fileName <file-name> 
```

### check_webhook_events_duplicated
Vuoi verificare se ci sono degli eventi con campo timeline duplicati nella tabella webhook-events?
```bash
node index.js --envName <env-name> --hashKey <hash-key> --sortKey <sort-key>
```

### check_feedback_from_requestId_simplified
Vuoi verificare se per un evento di prepare abbiamo ricevuto un send analog feedback?
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### notificationMetadata_analysis
Vuoi verificare se una notifica è stata accettata e in quale stato si trova?
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### notificationMetadata_generation
Vuoi aggiornare pn-notificationMetadata in base all'output dello script notificationMetadata_analysis?
```bash
node index.js --envName <env-name> --fileName <file-name> [--dryrun]
```

### recovery_dp-inputs
Vuoi ricreare eventi di notification view della coda SQS delivery push inputs a partire da un file
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### temporary_fix_automation_script_dp-actions
Vuoi aggiornare pn-SsDocumenti aggiornado lo stato di una serie di documenti in attached?
```bash
node index.js --envName <env-name> --fileName <file-name> [--dryrun]
```

### find_discovered_address
Vuoi individuare i requestId che hanno in pn-ecRichiesteMetadati un evento con discoveredAddress valorizzato?
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### retrieve_requestId_from_iun
Vuoi recuperare tutti i requestId di prepare analogiche a partire da una serie di iun?
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### upsert_dynamodb
Vuoi aggiornare i dati di una tabella dynamo partendo da un file (dump)?
```bash
node index.js --envName <env-name> --account <account> --tableName <table-name> --fileName <file-name>
```

### check_safestorage_to_deliverypush
Vuoi verificare la DLQ safestorage_to_delivery_push?
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### paper_address_limit_correction
Vuoi bonificare la tabella pn-paper-address da indirizzi con nameRow2 superiore a 44 caratteri?
```bash
node index.js --envName <env-name> --fileName <file-name> [--backup] [--dryrun]
```

### change_document_state
Vuoi modificare lo stato dei documenti nella tabella pn-SsDocumenti?
```bash
node index.js --envName <env-name> --fileName <file-name> --documentState <document-state> [--dryrun]
```

### check_category_from_iun
Vuoi verificare se una category è presente in timeline data una lista di iun?
```bash
node index.js --envName <env-name> --fileName <file-name> --category <category>
```

### legal_conservation_inject
Vuoi mandare dei documenti in conservazione a norma?
```bash
node index.js --envName <env-name> --fileName <file-name> --dryrun
```

### retrieve_from_dynamo_by_pk
Vuoi ricercare su una tabella dynamo tramite query su chiavi?
```bash
node index.js --envName <env-name> --account <account> --fileName <file-name> --tableName <table-name> --keyName <key-name> [--prefix <prefix> --suffix <suffix>]
```

### paper_address_decode
Vuoi fare la codifica della pn-paperAddress fornendo dei requestId in input?
```bash
node index.js --envName <env-name> --fileName <file-name>
```

### false_negative_ec_tracker
Vuoi rimuovere i falsi negativi dalla DLQ ec tracker?
```bash
node index.js --envName <envName> --fileName <fileName> --channelType <channel-type>
```

### disable_future_actions
Vuoi disabilitare delle future actions?
```bash
node index.js --envName <envName> --fileName <fileName> [--dryrun]
```

### retrieve_notification_metadata
Vuoi verificare lo status della notifica in pn-notificationMetadata?
```bash
node index.js --envName <envName> --fileName <fileName>
```
