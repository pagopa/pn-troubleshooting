# ss-coherence-check

Script per eseguire il controllo di coerenza di una serie di file confrontando i dati salvati su DynamoDB con quelli rinvenuti dal file stesso.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il package contiene uno script che, presa una serie di fileKey, reperisce i corrispettivi record Dynamo e oggetti S3 e ne confronta i dati.

## Installazione

```bash
npm install
```

## Utilizzo

### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione

```bash
node index.js --inputFile <input-file> --bucket <source-bucket> --awsProfile <aws-profile> --awsRegion <aws-region> --searchPath <search-path>
```

Dove:

- `<input-file>` file di input contenente le fileKey dei record su cui va eseguito il controllo.
- `<source-bucket>` bucket di origine da cui reperire i file.
- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di sistema; `OPZIONALE`
- `<aws-region>` è la region dei client AWS. Se non viene inserita, verrà presa la region di default del sistema; `OPZIONALE`
- `<search-path>` è il path completo in cui eseguire la ricerca dei file S3 dal bucket. Se non viene impostato, la ricerca verrà eseguita senza prefissare il path alla fileKey; `OPZIONALE`

Alla fine del processo, verranno generati tre file:

- _"output.txt"_ contenente le fileKey dei record coerenti.
- _"incoherent.txt"_ contenente le fileKey dei record non coerenti, la causa dell'incoerenza e il timestamp.
- _"failures.txt"_ contenente le fileKey dei record su cui il processo è andato in eccezione, la causa dell'errore e il timestamp.