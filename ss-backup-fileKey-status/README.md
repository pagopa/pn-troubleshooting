# ss-backup-fileKey-status

Script per eseguire il backup di una serie di record Dynamo, a partire dalla tabella "pn-SsDocumenti"

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il package contiene uno script che, presa una serie di fileKey, reperisce i corrispettivi record Dynamo dalla tabella "
pn-SsDocumenti" e ne esegue il
backup su un file .txt.

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
node index.js --inputFile <input-file> --awsProfile <aws-profile> --awsRegion <aws-region> --dryrun
```

Dove:

- `<input-file>` file di input contenente le fileKey dei record di cui va eseguito il backup.
- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di
  sistema; `OPZIONALE`
- `<aws-region>` è la region dei client AWS. Se non viene inserita, verrà presa la region di default del
  sistema; `OPZIONALE`
- `<dryrun>` se inserito, attiva la modalità dryrun. Questa modalità attiva automaticamente anche quella di test, e in
  piu'
  disattiva le operazioni di scrittura. `OPZIONALE`

Alla fine del processo, verranno generati due file:

- _"output_3.txt"_ contenente le fileKey dei record su cui il processo è andato a buon fine e i corrispettivi record in
  formato JSON.
- _"failures_3.txt"_ contenente le fileKey dei record su cui il processo è andato in eccezione, la causa dell'errore e
  il timestamp.