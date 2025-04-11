# Script ss-checksum-fix

Lo script offre due funzionalità su oggetti SS con checksum errato.

## Funzionalità

- **s3-cleanup**:  
  - Per ogni fileKey presente nella lista TXT di input, lo script utilizza le funzioni S3 di `pn-common` per elencare tutte le versioni dell'oggetto nel bucket `pn-safestorage-eu-south-1-<AccountId>`.  
  - Se nella lista risultano almeno due versioni (valutate in base all'attributo `LastModified`), viene eliminata la versione più recente.
  - Stampa due file TXT in output, uno con la lista delle fileKeys di cui è stata cancellata una versione e l'altro con la lista di fileKeys non interessate dall'operazione.

- **ddb-update**:  
  Per ogni fileKey (usato come `documentKey`), lo script esegue una query sulla tabella DynamoDB `pn-SsDocumenti` e aggiorna l'item impostando `documentLogicalState` a `'SAVED'` e `documentState` a `'available'`.

## Parametri

- `--dryRun` oppure `-d`: Opzionale, simula esecuzione senza effettuare modifiche.
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
