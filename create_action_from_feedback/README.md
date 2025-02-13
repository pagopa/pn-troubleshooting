# Creazione Action a partire da feedback

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script:
- prende in input un file CSV avente colonne: "iun","timelineelementid","timestamp","category";
- fornisce in output il file ./results/create_action_from_feedback_\<date>.csv, avente colonne: "actionId","ttl","notToHandle" (notToHandle=false).
	
NB: I timelineElementId nel file CSV che non contengono le sottostringe "SEND_ANALOG_FEEDBACK" oppure "SEND_DIGITAL_FEEDBACK" genereranno l'eccezione "timelineElementIdError" che interromperà l'esecuzione dello script.

## Installazione

```bash
npm install
```

## Utilizzo

```bash

node index.js \
	--fileName <csv file> \
	--ttl <time in ms> \
	[--start <timelineElementId>]

```

Dove:
- fileName: è il file CSV contentente le colonne "iun","timelineelementid","timestamp","category";
- ttl: è il TimeToLive espresso in millisecondi;
- start: è il timelineElementId di partenza.
