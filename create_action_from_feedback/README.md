# Creazione Action a partire da feedback

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script:
- 

## Installazione

```bash
npm install
```

## Utilizzo

```bash

node index.js \
	[--region region] \
	--env <dev|test|uat|hotfix> \
	--fileName <csv file> \
	--ttl <time in ms>

```

Dove:
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target;
- fileName: è il file CSV contentente le colonne actionId e TTL;
- ttl: è il TimeToLive espresso in millisecondi.

