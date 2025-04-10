# Script ss-checksum-fix

Questo script NodeJS offre due funzionalità su oggetti SS con checksum errato.

## Funzionalità

- **s3-cleanup**:  
  Per ogni fileKey presente nella lista TXT di input, lo script utilizza le funzioni S3 (dal modulo `pn-common`) per elencare tutte le versioni dell'oggetto nel bucket `pn-safestorage-eu-south-1-<AccountId>`.  
  Se nella lista risultano almeno due versioni (valutate in base all'attributo `LastModified`), viene eliminata la versione più recente.

- **ddb-update**:  
  Per ogni fileKey (usato come `documentKey`), lo script esegue una query sulla tabella DynamoDB `pn-SsDocumenti` e aggiorna l'item impostando `documentLogicalState` a `'SAVED'` e `documentState` a `'available'`.

## Parametri

- `--envName` oppure `-e`: Specifica l'ambiente da utilizzare. Valori validi: `dev`, `uat`, `test`, `prod`, `hotfix`.
- `--inputFile` oppure `-i`: Percorso del file TXT contenente una lista di fileKeys (uno per linea).
- `--command` oppure `-c`: Specifica il subcommand da eseguire. Valori ammessi:
  - `s3-cleanup`
  - `ddb-update`

## Esempi di utilizzo

Operazione su S3:
```
node index.js -e dev -i ./filekeys.txt -c s3-cleanup
```

Operazione su DynamoDB:
```
node index.js --envName prod --inputFile ./keys.txt --command ddb-update
```

Assicurarsi di avere il profilo AWS corretto configurato e che il modulo `pn-common` sia installato.
