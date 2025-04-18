# Cleanup previous notifications

Dato un elenco di requestId, uno script genera un array json in cui ogni elemento ha una struttura predefinita (index1.js). successivamente, con questo output, un altro script procede con l'inserimento dei dati nella tabella pn-PaperEvents.

## Indice

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
* [Esempi](#esempi)

## Descrizione

- index1.js
Data la lista di requestId da bonificare creare uno script che generi un json con un array dove ogni elemento avrà la seguente struttura recuperando i dati dalla tabella pn-EcRichiesteMetadati solo se nella eventsList di quel requestId è presente lo status code RECRN010:

{
 "pk": "META##PREPARE_ANALOG_DOMICILE.IUN_<IUN>.RECINDEX_0.ATTEMPT_0.PCRETRY_0",
 "sk": "META##RECAG010", // in alternativa META##RECRN010
 "requestId": "PREPARE_ANALOG_DOMICILE.IUN_<IUN>.RECINDEX_0.ATTEMPT_0.PCRETRY_0",
 "statusCode": "RECRN010",
 "statusDateTime": "2024-11-13T15:00:48Z",
 "ttl": 2046870048
}

Come TTL avremo (statusDateTime + 3650 giorni).toEpochSecond()

- index2.js
A partire dall'output prodotto dallo script index1.js, lo script eseguirà gli inserimenti dei dati nella tabella pn-PaperEvents in account core.

## Prerequisiti

- Node.js >= 18.0.0
- Accesso AWS SSO configurato
- File di input contenente i requestId

## Installazione

```bash
npm install
```

## Utilizzo

### Configurazione AWS SSO

Eseguire gli script
```bash

node node index1.js --envName <environment> --inputFile <path>
node node index2.js --envName <environment> --inputFile <path>
```
oppure
```bash
node index1.js -e <environment> -f <path>
node index2.js -e <environment> -f <path>
```
Dove:
- `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
- `<path>` è il percorso al file da elaborare
### Parametri

- --envName, -e:    Obbligatorio. Ambiente di destinazione (dev|uat|test|prod|hotfix)
- --inputFile, -f:  Obbligatorio. Percorso al file da elaborare
- --help, -h:       Visualizza il messaggio di aiuto

### File di Output

Lo script index1.js genera un array di json in cui ogni elemento ha una struttura predefinita nella cartella results/:

- `output_<sisdate>.json`: contiene i dati associati ad ogni requestId estratti dalla tabella pn-EcRichiesteMetadati presente in confinfo solo se nella eventsList di quel requestId è presente lo status code RECRN010.

### Esempio

```bash
node index1.js --envName dev --inputFile ./input.json`;
node index2.js --envName dev --inputFile ./results/output_<sisdate>.json`;
```