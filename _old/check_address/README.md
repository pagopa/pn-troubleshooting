# Edit Paper address information

Script di generazione hash per la modifica di un receiver address.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione
```bash
node index.js --awsCoreProfile <aws-core-profile> --envType <env-type> [--requestId <request-id>] [--inputFile <pathTo-input-file>] [--outputFile <name-output-file [--callAddressManager <call-address-manager>] [--nrBasePath <basePath-national-registries>] [--adrMBasePath <basePath-address-Manager>] --apikeypdv <secret_value_tokenizer> --apikeyselfcare <secret_value_selfcare>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<env-type>` è l'ambiente sul quale si vuole avviare lo script;
- `<request-id>` è il request id del messaggio desiderato, del formato di paper-channel.
- `<inputFile>` è il path del file di input da utilizzare per la lettura dei requestID (del formato di paper-channel) N.B se valorizzato il valore di requestID verrà ignorato. File senza estensione.
- `<outputFile>` è il nome del file di output in cui verranno scritti i risultati. Nome file senza formato.
- `<callAddressManager>` se valorizzato lo script eseguirà la chiamata di deduplica di addressManager
- `<nrBasePath>` è il basePath utilizzato per l'invocazione di nationalRegistries DEFAULT: http://localhost:8888 -- SE valore di default usare bastionHost
- `<adrMBasePath>` è il basePath utilizzato per l'invocazione di addressManager DEFAULT: http://localhost:8887 -- SE valore di default usare bastionHost
- `<apikeypdv>` è il valore della secret del tokenizer
- `<apikeyselfcare>` è il valore della secret di Selfcare

### Output
Lo script genera un file di output `outputFile_yyyy-MM-dd'T'HH:mm:ss.csv` con i risultati dell'estrazione