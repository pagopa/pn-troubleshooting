# ss-prepare-audit-files

Script di preparazione file audit

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script di preparazione file audit

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
node index.js --inputFile <input-file> --sourceBucket <source-bucket> --searchPath <search-path> --availabilityBucket <availability-bucket> --awsProfile <aws-profile> --awsRegion <aws-region>
```

Dove:

- `<input-file>` file di input contenente le informazioni dei documenti originali.
- `<source-bucket>` bucket di origine da cui reperire i file.
- `<search-path>` è il path completo in cui eseguire la ricerca dei file S3 dal source bucket. Se non viene impostato, la ricerca verrà eseguita senza prefissare il path alla fileKey; `OPZIONALE`
- `<availability-bucket>` bucket di disponibilità dei file di SafeStorage.
- `<aws-region>` è la region dei client AWS.
- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di sistema; `OPZIONALE`

Alla fine del processo, verranno generati tre file:

- _"output.txt"_ contenente le fileKey dei documenti reperiti con successo.
- _"incoherent.txt"_ contenente le fileKey dei documenti non coerenti, la causa dell'incoerenza e il timestamp.
- _"failures.txt"_ contenente le fileKey dei documenti su cui il processo è andato in eccezione, la causa dell'errore e il timestamp.