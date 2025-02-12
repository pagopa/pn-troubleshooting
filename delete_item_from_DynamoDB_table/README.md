# Delete Item From DynamoDB

Script per l'eliminazione massiva di elementi dalle tabelle su DynamoDB

## Indice

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
* [Esempi](#esempi)

## Descrizione

Lo script analizza un file in ingresso contenente le righe da cancellare, come ad esempio un dump prelevato dallo script [clear-paper-errors](https://github.com/pagopa/pn-troubleshooting/tree/main/clear-paper-errors) oppure da [dump_dynamodb](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_dynamodb) e, dopo aver ricavato sort key e partition key della tabella dove eseguire l'eliminazione, inizia a costruirsi delgi array conteneti ognuno 25 coppie esclusivamente di sort key e partition key, ignorando tutte le altri valori eventualmente presenti.

Una volta creati tutti i blocchi di righe, viene eseguita l'eliminazione a batch.

In caso di problemi di elaborazione, le righe non eliminate vengono salvate in un file di output.

## Prerequisiti

- Node.js >= 18.0.0
- Accesso AWS SSO configurato
- File di input contenente le righe da rimuovere
- Nome della tabella

## Installazione

```bash
npm install
```

## Utilizzo

### Configurazione AWS SSO

Eseguire lo script
```bash

node delete_item_from_DynamoDB.js --accountType <AWSAccount> --envName <env> --tableName <tableName> --inputFile <path>
```
oppure
```bash
node delete_item_from_DynamoDB.js -a <AWSAccount> -e <env> -t <tableName> -f <path>
```
Dove:
- `<AWSAccount>` è l'account AWS dove si trova la tabella, deve essere uno tra: core, confinfo
- `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
- `<tableName>` è il nome della tabella dove verranno eliminate le righe
- `<path>` è il percorso al file contenente le righe da rimuovere 

### Parametri

- --accountType, -a:Obbligatorio. Account dove si trova la tabella (core|confinfo)
- --envName, -e:    Obbligatorio. Ambiente di destinazione (dev|uat|test|prod|hotfix)
- --tableName, -t:  Obbligatorio. Tabella dove verranno eliminate le righe
- --inputFile, -f:  Obbligatorio. Percorso al file contenente le righe da rimuovere
- --help, -h:       Visualizza il messaggio di aiuto

### File di Output

Lo script genera un file in caso di impossibilità all'eliminazionenella cartella results/:

- `item_not_deleted.json`: contiene le righe che non sono state eliminate

### Esempi

Analisi di un file di dump in ambiente dev:
```bash
node delete_item_from_DynamoDB.js --accountType core --envName dev --tableName pn-PaperRequestError --inputFile ./input.json
```