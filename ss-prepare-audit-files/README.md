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



## Descrizione

Script di preparazione file audit, che genera un file txt in cui vengono bonificati i nomi dei file partendo dal bucket di origine

## Utilizzo

### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
```

## Installazione

```bash
npm install
```

### Esecuzione
```bash
node sha-check.js --inputFile <input-file> --awsRegion <aws-region> --sourceBucket <source-bucket> --searchPath <search-path>
```

Dove:

- `<input-file>` file di input contenente le informazioni dei documenti originali.
- `<aws-region>` è la region dei client AWS.
- `<source-bucket>` bucket di origine da cui reperire i file.
- `<search-path>` è il path completo in cui eseguire la ricerca dei file S3 dal source bucket. Se non viene impostato, la ricerca verrà eseguita senza prefissare il path alla fileKey; `OPZIONALE`

Alla fine del processo, verranno generati tre file:

- _"output.txt"_ contenente IUN, title corretto, SHA, title di safestorage e SHA
- _"incoherent.txt"_ contenente lo SHA che non è stato trovato nel bucket di orgine o nel file in input.
- _"failures.txt"_ contenente le fileKey dei documenti su cui il processo è andato in eccezione, la causa dell'errore e il timestamp.