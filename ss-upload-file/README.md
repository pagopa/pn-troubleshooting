# ss_upload_file

Script per eseguire l'upload su S3 di una serie di file.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il package contiene uno script che, presa una serie di fileKey, reperisce i corrispettivi oggetti S3 da un bucket di
origine e li carica su un bucket di destinazione.

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
node index.js --inputFile <input-file> --sourceBucket <source-bucket> --searchPath <search-path> --destinationBucket <destination-bucket> --awsProfile <aws-profile> --awsRegion <aws-region> --dryrun
```

Dove:

- `<input-file>` file di input contenente le fileKey dei record di cui va eseguito il backup.
- `<source-bucket>` bucket di origine da cui reperire i file.
- `<search-path>` è il path completo in cui eseguire la ricerca dei file S3 dal source bucket. Se non viene impostato, la ricerca verrà eseguita senza prefissare il path alla fileKey; `OPZIONALE`
- `<destination-bucket>` bucket di destinazione su cui caricare i file.
- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di
  sistema; `OPZIONALE`
- `<aws-region>` è la region dei client AWS. Se non viene inserita, verrà presa la region di default del
  sistema; `OPZIONALE`
- `<dryrun>` se inserito, attiva la modalità dryrun. Questa modalità attiva automaticamente anche quella di test, e in
  piu'
  disattiva le operazioni di scrittura. `OPZIONALE`

Alla fine del processo, verranno generati due file:

- _"output.txt"_ contenente le fileKey dei record caricati correttamente sul bucket di destinazione.
- _"failures.txt"_ contenente le fileKey dei record su cui il processo è andato in eccezione, la causa dell'errore e
  il timestamp.