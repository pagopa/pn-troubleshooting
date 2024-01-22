# Incremental Export  DynamoDB table

Template CFN per export incrementale di una tabella dynamoDB

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il template esegue il deploy di una lambda che viene attivata da un evento event-brige alle 05:00 UTC, la lambda esegue un export incrementale:

dato il giorno "i_esimo", la lambda esegue l'export dalle ore 00:00 UTC del giorno "i-1" alle ore 00:00 del giorno "i"

i log dell'esecuzione della lambda hanno retention 3gg


## Installazione

importare il template in CFN ed impostare i parametri:
DynamoDBTableArn: arn della tabella dynamo
S3Bucket: nome del bucket
S3Prefix: prefisso dopo il nome del bucket (es. /bucket_name/table_name)
Prefix: prefisso dopo S3Prefix - default "export"  (es. /bucket_name/table_name/export) 

dopo il Prefix verra' inserita la data del giorno "i_esimo" (es /bucket_name/table_name/prefix/20240109)


