# ss-change-logical-status

Script per cambiare il documentLogicalState di una serie di record Dynamo nella tabella "pn-SsDocumenti" attraverso la chiamata "updateMetadata"

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

```bashset 
aws sso login --profile sso_pn-confinfo-<env>
```

### Esecuzione

```bash
node index.js --inputFile <input-file> --newStatus <new-status> --awsProfile <aws-profile> --awsRegion <aws-region> --sCxId <sCxId> --sAPIKey <sAPIKey> --uriUpdateMetadata <uriUpdateMetadata> --baseUrl <baseUrl> --dryrun
```

Dove:

- `<input-file>` file di input contenente le fileKey su cui attuare il cambio di stato.
- `<new-status>` il nuovo stato da applicare al record Dynamo.
- `<aws-profile>` è il profilo dell'account AWS. Se non viene inserito, verranno prese di default le credenziali AWS di
  sistema; `OPZIONALE`
- `<aws-region>` è la region dei client AWS. Se non viene inserita, verrà presa la region di default del
  sistema; `OPZIONALE`
- `<sCxId>` è l'identidicativo client AWS, necessario per eseguire la chiamata API.
- `<sAPIKey>` è la stringa che che identifica la chiave alla chiamata.
- `<baseURL>` identifica l'url di base per la chiamata HTTP.
- `<uriUpdateMetadata>` è il path url per la chiamata updateMetadata.
- `<dryrun>` se inserito, attiva la modalità dryrun. Questa modalità attiva automaticamente anche quella di test, e in
  piu'
  disattiva le operazioni di scrittura. `OPZIONALE`

Alla fine del processo, verranno generati due file:

- _"output.txt"_ contenente le fileKey dei record su cui il processo è andato a buon fine.
- _"incoherent.txt"_ contenente le fileKey dei record che sono incoerenti rispetto a Dynamo.
- _"failures.txt"_ contenente le fileKey dei record su cui il processo è andato in eccezione, la causa dell'errore e il
  timestamp.