# SafeStorage Manage Retention

Script per la gestione delle date di retention dei documenti in SafeStorage

## Indice

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Parametri](#parametri)
  * [File di Output](#file-di-output)
  * [Esempi](#esempi)

## Descrizione

Lo script, nella sua modalità predefinita, accetta in input un CSV con una singola colonna `fileKey` contenente le chiavi degli oggetti di cui verificare la retention interrogando il main bucket di SafeStorage.

Aggiungendo l'opzione `--update` lo script opera in modalità aggiornamento, dove richiede in input un CSV con due colonne: la colonna `fileKey` come sopra descritta più una colonna `retentionUntil` dove è indicata la data in formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) alla quale aggiornare la retention del documento.

Nella seconda modalità, lo script esegue le seguenti operazioni aggiuntive:

* Apre una connessione SSM verso l'ALB interno di Confinfo passando per la EC2 Bastion in Core
* Chiama SafeStorage attraverso l'ALB per aggiornare la retention di tutti i documenti nel CSV
* Verifica sul main bucket di SafeStorage l'effettivo aggiornamento di tutte le retention
* Chiude la connessione SSM

## Prerequisiti

* Node.js >= 18.0.0
* File .env locale con le variabili d'ambiente necessarie
  * SS_ALB_ENDPOINT=
  * SSM_FORWARD_PORT=880
  * SSM_LOCAL_PORT=
  * SS_BASE_URL=
* File CSV con i documenti da verificare

## Installazione

```bash
npm install
```

## Utilizzo

```bash
node index.js --envName <env> --csvFile <path-to-csv> [--update]
```

oppure

```bash
node index.js -e <env> -f <path-to-csv> [-u]
```

### Parametri

* `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
* `<path-to-csv>` è il percorso al file CSV con le chiavi dei documenti da analizzare (uno per riga)

### File di Output

Lo script produce due file di output nella cartella `results/` a seconda della modalità di esecuzione:

* `results/retention_query_results_${date}.csv`
* `results/retention_update_results_${date}.csv`

### Esempi

```bash
node index.js --csvFile ./fileKeys.csv
```
