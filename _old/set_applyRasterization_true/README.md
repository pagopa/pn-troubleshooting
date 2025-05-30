# Set applyRasterization: true in pn-paperRequestDelivery

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script:
- prende in input un file .txt con una colonna (requestId);
- effettua una chiamata [UpdateItemCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand/) verso la tabella 'pn-paperRequestDelivery' per aggiungere l'attributo "applyRasterization" valorizzato a "true";
- fornisce in output il file ./results/failed/updateItems_from_txt_\<date>.json, contenente l'elenco dei requestId scartati in quanto non presenti nella tabella pn-paperRequestDelivery.
	
NB: I requestId che generano un'eccezione diversa dalla "ConditionalCheckFaildedException" interromperanno l'esecuzione dello script.


## Installazione

```bash
npm install
```

## Utilizzo

```bash

node index.js \
	[--region region] \
	--env <dev|test|uat|hotfix> \
	--fileName <txt file> \
	[--startReqjestId <value>]

```

Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- fileName: è il file .txt contentente la colonna requestId;
- startRequestId: è il requestId di partenza. Se questo parametro non è definito lo script elaborerà tutti i requestId presenti nel file .txt.
