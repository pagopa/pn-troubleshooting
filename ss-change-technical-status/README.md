# ss-change-technical-status

Script per cambiare il documentState di una serie di record Dynamo nella tabella "pn-SsDocumenti"

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Il package contiene uno script atto al cambio di stato di record Dynamo nella tabella "pn-SsDocumenti".

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
node index.js --inputFile <input-file> --newStatus <new-status> --awsProfile <aws-profile> --awsRegion <aws-region> --dryrun
```

Dove:

- `<input-file>` file di input contenente le fileKey su cui attuare il cambio di stato.
- `<new-status>` il nuovo stato da applicare al record Dynamo.
- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di
  sistema; `OPZIONALE`
- `<aws-region>` è la region dei client AWS. Se non viene inserita, verrà presa la region di default del
  sistema; `OPZIONALE`
- `<dryrun>` se inserito, attiva la modalità dryrun. Questa modalità attiva automaticamente anche quella di test, e in
  piu'
  disattiva le operazioni di scrittura. `OPZIONALE`

Alla fine del processo, verranno generati due file:

- _"output.txt"_ contenente le fileKey dei record su cui il processo è andato a buon fine.
- _"failures.txt"_ contenente le fileKey dei record su cui il processo è andato in eccezione, la causa dell'errore e il
  timestamp.