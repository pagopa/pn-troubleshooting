# ss-check-differences

Script per eseguire un controllo tra dei record Dynamo salvati in precedenza e la loro attuale versione in DynamoDB.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il package contiene uno script che, preso in ingresso un file contenente dei record precedentemente salvati e uno contenente una serie di fileKey, esegue un controllo di uguaglianza tra i record salvati e quelli presenti in quel momento su Dynamo nella tabella "pn-SsDocumenti".

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
node index.js --fileKeys <input-file> --savedRecords <saved-records> --awsProfile <aws-profile> --awsRegion <aws-region> --dryrun
```

Dove:

- `<file-keys>` file di input contenente le fileKey su cui effettuare il controllo.
- `<saved-records>` file di input contenente delle fileKey e i corrispettivi record Dynamo in formato JSON.
- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di sistema; `OPZIONALE`
- `<aws-region>` è la region dei client AWS. Se non viene inserita, verrà presa la region di default del sistema; `OPZIONALE`
- `<dryrun>` se inserito, attiva la modalità dryrun. Questa modalità attiva automaticamente anche quella di test, e in piu'
  disattiva le operazioni di scrittura. `OPZIONALE`

Alla fine del processo, verranno generati due file:

- _"output.txt"_ contenente le fileKey dei record su cui il processo è andato a buon fine.
- _"ignored.txt"_ contenente le fileKey dei record ignorati.
- _"incoherent.txt"_ contenente le fileKey dei record che non rispettano il controllo di uguaglianza e il dump delle due versioni.
- _"failures.txt"_ contenente le fileKey dei record su cui il processo è andato in eccezione, la causa dell'errore e il timestamp.