# Clear Paper Errors

Script per pulizia tabella pn-PaperRequestError.

## Indice

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
* [Esempi](#esempi)

## Descrizione

Lo script analizza un file di dump come prelevato dallo script [dump_dynamodb](https://github.com/pagopa/pn-troubleshooting/tree/main/dump_dynamodb) e:
- Legge identificativo della richiesta da ogni linea del dump
- Verifica nella corrispettiva Timeline se la notifica è stata cancellata

Gli identificativi delle richieste che superano i controlli vengono salvati in `results/safe_to_delete.json`, dove ogni linea è della forma seguente:

```json
{"created":"2024-11-13T01:55:50.518141362Z","requestId":"PREPARE_ANALOG_DOMICILE.IUN_UZKJ-NGJK-GDPD-202411-H-1.RECINDEX_0.ATTEMPT_0"}
```
Ovvero sort key e partition key di un record che si può cancellare dalla tabella pn-PaperRequestError.

## Prerequisiti

- Node.js >= 18.0.0
- Accesso AWS SSO configurato
- File di dump contenente gli errori da analizzare

## Installazione

```bash
npm install
```

## Utilizzo

### Configurazione AWS SSO

Prima di eseguire lo script, effettuare il login AWS SSO:
```bash
aws sso login --profile sso_pn-core-<env>
```
Dopodiché eseguire
```bash
node clear-paper-errors.js --envName <env> --dumpFile <path>
```
oppure
```bash
node clear-paper-errors.js -e <env> -f <path>
```
Dove:

- `<env>` è l'ambiente di destinazione, deve essere uno tra: dev, uat, test, prod, hotfix
- `<path>` è il percorso al file contenente il dump dalla tabella pn-PaperRequestError 

### Parametri

- --envName, -e: Obbligatorio. Ambiente di destinazione (dev|uat|test|prod|hotfix)
- --dumpFile, -f: Obbligatorio. Percorso del file di dump da analizzare
- --help, -h: Visualizza il messaggio di aiuto

### File di Output

Lo script genera due file nella cartella results/:

- `safe_to_delete.json`: contiene i requestId che possono essere eliminati
- `cannot_delete.json`: contiene i requestId che non possono essere eliminati

### Esempi

Analisi di un file di dump in ambiente dev:
```bash
node clear-paper-errors.js --envName dev --dumpFile ./dump.json
```