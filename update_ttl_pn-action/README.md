# Aggiornamento dei TTL nella tabella pn-Action

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script:
- prende in input un file CSV con due colonne, actionId e TTL (valori attuali);
- effettua una chiamata [UpdateItemCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand/) verso la tabella 'pn-Action' per aggiornare il TTL. Il nuovo valore sarà pari al TTL attuale + N giorni, con N parametro in input allo script (--days);
- fornisce in output un file che riporta l'elenco degli actionId che sono stati incrementat di "days" giorni. 

NB: Lo script interrompe l'esecuzione in caso di errore.

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
	--fileName <csv file>

```

Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- days: è il numero di giorni da aggiungere all'attuale TTL;
- fileName: è il file CSV contentente le colonne actionId e TTL.
