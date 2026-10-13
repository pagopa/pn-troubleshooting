# Spec: ultimo canale consegnato nel report di sintesi

## Stato

Approvata come base per la pianificazione il 2026-10-07.
Piano e task in `PLAN-last-delivered-channel.md`; implementazione completata,
con verifiche locali riportate nel piano.

## Obiettivo

Aggiungere al report `informal_summary.csv` il canale dell'ultima consegna
riuscita della comunicazione. Non rappresenta l'ultimo tentativo di invio.
Conservare i dati attuali e il report timeline raw.

## Requisiti confermati

- Una nuova colonna; valori `IO`, `PEC`, `SMS`, `EMAIL`,
  `ANALOG_<deliveryType>`.
- Per ANALOG indicare il prodotto postale tramite `deliveryType`.
- Se non esiste una consegna riuscita, lasciare il campo vuoto.

## Contratto

Header: `IUN,notificationStatus,analogCost,lastDeliveredChannel`.
La colonna viene aggiunta in fondo; `analogCost` resta sempre `0`.

La sorgente e' `detail.timeline` della risposta API, non il CSV esportato.
Nel CSV di esempio questi elementi sono contenuti in `JSON.informalElement`.

1. Considerare gli eventi con `category === 'DELIVERED'`.
2. Selezionare quello con `eventTimestamp` cronologicamente piu' recente,
   indipendentemente dall'ordine della timeline e dal destinatario.
3. Per `details.channel` uguale a `IO`, `PEC`, `SMS` o `EMAIL`,
   riportare direttamente il valore.
4. Per `details.channel === 'ANALOG'`, risolvere
   `details.sourceElementId` contro `elementId` nella stessa timeline.
   Leggere `details.deliveryType` dell'evento collegato e produrre
   `ANALOG_<deliveryType>`, senza tradurre o limitare i prodotti a `RS`.
5. Senza eventi `DELIVERED`, restituire il campo vuoto, anche se sono
   presenti invii o feedback `OK`.

Gli eventi preparatori, gli invii, i progress e la chiusura workflow
non sostituiscono una consegna. Un tentativo fallito successivo non cambia
il valore dell'ultima consegna riuscita.

### Evidenza disponibile

L'esempio fornito contiene:

- `SEND_DIGITAL_MESSAGE_FEEDBACK`, canale `IO`, `responseStatus: 'KO'`;
- `SEND_ANALOG_MESSAGE_FEEDBACK`, `responseStatus: 'OK'`,
  `deliveryType: 'RS'`;
- `DELIVERED`, canale `ANALOG`, con `sourceElementId` riferito a quel feedback;
- successiva chiusura `WORKFLOW_DONE_REACHED`.

Il risultato atteso e' `ANALOG_RS`. Non riprodurre nel repository
indirizzi, identificativi personali o riferimenti agli allegati dell'esempio.
Non sono ancora disponibili esempi di consegne digitali riuscite:
il contratto usa `DELIVERED` anche per questi canali. L'assenza di esempi
digitali resta un rischio da verificare, non autorizza fallback impliciti.

### Casi limite

- Timestamp: usare `eventTimestamp`, con fallback a `timestamp` solo se
  assente; conservare la precisione sub-millisecondo e confrontare istanti,
  non stringhe ISO non normalizzate.
- Parita' di istante: scegliere l'ultimo `DELIVERED` nell'ordine originale.
- Piu' destinatari: una sola colonna per IUN, ultima consegna complessiva.
- Un `DELIVERED` con timestamp non valido, canale mancante/non supportato,
  riferimento ANALOG non risolvibile o `deliveryType` mancante e' un errore
  esplicito per lo IUN, attraverso la gestione errori esistente (stderr,
  exit code 1). Non produrre `ANALOG_undefined`, non ripiegare su una
  consegna precedente e non confondere dati incompleti con nessuna consegna.

## Tech stack

Node.js >= 18, JavaScript CommonJS, nessuna nuova dipendenza.
Dipendenze attuali: dotenv ^16.4.5, nodemailer ^9.0.5,
@aws-sdk/client-sesv2 ^3.1119.0; smtp-server ^3.19.3 nei test.

## Comandi

Eseguire dalla radice del repository:

```bash
npm --prefix informal_report_csv run check
npm --prefix informal_report_csv run test:unit:channel
npm --prefix informal_report_csv run test:mock
npm --prefix informal_report_csv run check:e2e
```

Esecuzione CLI (richiede configurazione e accesso API, non e' un test automatico):

```bash
node informal_report_csv/export_informal_csv.js --iun <IUN> --output-dir ./out
```

Non sono configurati build, type-check o lint separati.
Non eseguire test DEV, Docker, SMTP reale o AWS reale automaticamente.

## Struttura progetto

- `export_informal_csv.js`: estrazione summary, serializzazione CSV e CLI.
- `tests/`: test automatici mock con assert Node.js e server locali.
- `e2e/`: verifiche DEV manuali; adeguare le aspettative sull'header.
- `lib/`: invio email, invariato.
- `lib/lastDeliveredChannel.js`: helper puro per estrarre il canale consegnato.
- `tests/lastDeliveredChannel.test.js`: test unitari del calcolo.
- `README.md`: documentare colonna, selezione e casi senza consegna.
- `SPEC-last-delivered-channel.md`: contratto della modifica.

## Stile

Seguire `'use strict'`, CommonJS, indentazione a due spazi,
nomi camelCase, confronti stretti e helper focalizzati.
Esempio di output atteso nel formato CSV attuale:

```csv
IUN,notificationStatus,analogCost,lastDeliveredChannel
"TEST-IUN","COMPLETED_REACHED","0","ANALOG_RS"
```

## Strategia di test

Usare gli strumenti esistenti e payload sintetici privi di dati personali.
Copertura funzionale richiesta:

- ciascuno dei quattro canali digitali;
- ANALOG_RS e un altro deliveryType sintetico;
- esempio IO KO seguito da ANALOG consegnato;
- piu' consegne, timeline non ordinata, piu' destinatari;
- fallimento successivo alla consegna;
- timeline vuota/assente e soli tentativi/feedback senza DELIVERED;
- precisione timestamp, fallback e parita';
- dati di consegna incompleti: errore esplicito;
- header esatto, campi precedenti invariati, timeline raw invariata;
- batch e allegati email continuano a includere i due report.

Non e' definita una soglia numerica di coverage nel progetto.

## Confini

- Sempre: preservare colonne esistenti, rate limiting, retry, errori e
  invio email; aggiornare documentazione e aspettative direttamente correlate.
- Chiedere prima: cambiare queste regole, aggiungere dipendenze, modificare
  configurazione CI o interrogare ambienti reali.
- Mai: includere dati personali o segreti nelle fixture; inferire il successo
  da codici postali non documentati o dal solo stato generale del workflow;
  modificare report non richiesti.

## Criteri di successo

Tutti i casi sopra sono verificati dai test mock; l'header ha esattamente
quattro colonne nell'ordine specificato; l'esempio produce `ANALOG_RS`;
in assenza di DELIVERED il campo e' vuoto; syntax check e verifiche mock
correlate passano, senza modificare il contenuto della timeline raw.

## Verifiche residue

Confrontare, quando disponibili, esempi digitali reali anonimizzati con
il contratto DELIVERED. Eventuali divergenze richiedono aggiornamento della
specifica prima di introdurre regole alternative.
