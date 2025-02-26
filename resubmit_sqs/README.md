# Delete Item From DynamoDB

Script per l'eliminazione massiva di elementi dalle tabelle su DynamoDB

## Indice

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
* [Esempi](#esempi)

## Descrizione

Lo script analizza un file in ingresso contenente dei messaggi da reinserire in una coda SQS, come ad esempio un dump prelevato dallo script [dump_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_sqs). Completata la formattazione del file di input, che può essere anche un Json in line contenente per ogni riga un Body e un MessageAttributes, viene eseguito il caricamento dei messaggi sulla coda.

In caso di problemi di elaborazione, i messaggi non caricati vengono salvate in un file di output.

## Prerequisiti

- Node.js >= 18.0.0
- Accesso AWS SSO configurato
- File di input contenente i messaggi da caricare
- Url della coda

## Installazione

```bash
npm install
```

## Utilizzo

### Configurazione AWS SSO

Eseguire lo script
```bash

node resubmit_sqs_messages.js --accountType <AWSAccount> --envName <environment> --queueUrl <queueUrl> --inputFile <path>
```
oppure
```bash
node resubmit_sqs_messages.js -a <AWSAccount> -e <environment> -q <queueUrl> -f <path>
```
Dove:
- `<AWSAccount>` è l'account AWS dove si trova la tabella, deve essere uno tra: core, confinfo
- `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
- `<queueUrl>` è il nome della coda SQS dove caricare i messaggi
- `<path>` è il percorso al file contenente i messaggi 

### Parametri

- --accountType, -a:Obbligatorio. Account dove si trova la tabella (core|confinfo)
- --envName, -e:    Obbligatorio. Ambiente di destinazione (dev|uat|test|prod|hotfix)
- --queueUrl, -q:   Obbligatorio. Coda SQS dove caricare i messaggi
- --inputFile, -f:  Obbligatorio. Percorso al file contenente i messaggi 
- --help, -h:       Visualizza il messaggio di aiuto

### File di Output

Lo script genera un file in caso di impossibilità di caricamento messaggio cartella results/:

- `msg_not_resubmitted_<nome_coda>.json`: contiene i riferimenti ai messaggi non caricati in coda

### Esempio

```bash
node resubmit_sqs_messages.js --accountType core --envName hotfix --queueUrl https://sqs.eu-south-1.amazonaws.com/207905393513/pn-national_registry_gateway_inputs-DLQ --inputFile ./input.json
```