# Aggiornamento dei TTL nella tabella pn-Action

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script:
- prende in input un file CSV con due colonne, actionId e TTL (valori attuali);
- effettua una chiamata [UpdateItemCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand/) verso la tabella 'pn-Action' per aggiornare il TTL. Il nuovo valore sarà pari al TTL attuale + N giorni, con N parametro in input allo script (--days);
- fornisce in output il file ./results/failed/updateItems_from_csv_\<date>.json, contenente l'elenco degli actionId scartati in quanto non presenti nella tabella pn-Action (vedi [ConditionalCheckFailedException](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-dynamodb/Class/ConditionalCheckFailedException/)). Questo tipo di eccezione è gestita e l'esecuzione dello script non verrà interrotta.
	
NB: Gli actionId che generano un'eccezione diversa dalla "ConditionalCheckFaildedException" interromperanno l'esecuzione dello script.


## Installazione

```bash
npm install
```

## Utilizzo

```bash

node index.js \
	[--region region] \
	--env <dev|test|uat|hotfix> \
	--days <num> \
	--fileName <csv file> \
	[--startActionId <value>]

```

Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- days: è il numero di giorni da aggiungere all'attuale TTL;
- fileName: è il file CSV contentente le colonne actionId e TTL;
- startActionId: è l'actionId di partenza. Se questo parametro non è definito lo script elaborerà tutti gli actionId presenti nel file CSV.
