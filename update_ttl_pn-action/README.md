# Aggiornamento dei TTL nella tabella pn-Action

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script:
- prende in input un file CSV con due colonne, actionId e TTL (valori attuali);
- effettua una chiamata [UpdateItemCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/UpdateItemCommand/) verso la tabella 'pn-Action' per aggiornare il TTL. Il nuovo valore sarà pari al TTL attuale + N giorni, con N parametro in input allo script;
- fornisce in output un file che riporta l'elenco degli actionId che sono stati aggiornati. 

NB: Lo script interrompe l'esecuzione in caso di errore.

## Installazione

```bash
npm install
```

## Utilizzo

```bash

node index.js \
	--accountType <core|confinfo> \
	[--region region] \
	--env <dev|test|uat|hotfix>
	--file <csv file>
	--gg <num>

```

Dove:
- accountType: è il tipo di account AWS;
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- file: è il file CSV contentente le colonne actionId e TTL;
- gg: è il numero di giorni da aggiungere all'attuale TTL.
