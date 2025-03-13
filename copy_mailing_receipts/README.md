# Copia delle ricevute di postalizzazione

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script:
- prende in input un file contenente l'elenco delle filekey associate ai file da copiare;
- effettua una chiamata [getObjectCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/GetObjectCommand) per recuperare il file dal bucket S3 sorgente;
- effettua una chiamata [putObjectCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/command/PutObjectCommand) per caricare il file sul bucket S3 destinazione;
- fornisce in output il file ./results/failed/copy_mailing_receipts_\<date>.json, contenente l'elenco delle fileKey scartate in quanto non presenti sul bucket S3 sorgente (vedi [noSuchKey](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Class/NoSuchKey)). Questo tipo di eccezione è gestita e l'esecuzione dello script non verrà interrotta.
	
**NB**: 
1. Le fileKey che generano un'eccezione diversa dalla "noSuchKey" interromperanno l'esecuzione dello script;
2. Lo script è pensato per eseguire copie di file tra bucket **nello stesso ambiente** e/o in account AWS differenti.


## Installazione

```bash
npm install
```

## Utilizzo

```bash

node index.js \
	[--region <region>] \
	[--env <dev|test|uat|hotfix>] \
	[--srcAccountType <core|confinfo>] \
	--srcBucket <src bucket name> \
	[--dstAccountType <core|confinfo>] \
	--dstBucket <dst bucket name> \
	--fileName <file name> \
	[--startFileKey <startFileKey>] 

```

Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente src = ambiente dst;
- srcAccountType: è l'account type dell'ambiente sorgente;
- srcBucket: è il nome del bucket S3 sorgente;
- dstAccountType: è l'account type dell'ambiente destinazione;
- dstBucket: è il nome del bucket S3 destinazione;
- fileName: è il file contenente l'elenco delle fileKey da copiare;
- startFileKey: è l'actionId di partenza. Se questo parametro non è definito lo script elaborerà tutti gli actionId presenti nel file CSV.
