# rework_flow

Script di analisi e redrive di requestId da file CSV.
## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo script legge un CSV di input e, per ogni `requestId`, esegue una sequenza di controlli su timeline, tentativi e allegati.

In particolare:
- verifica gli elementi timeline rilevanti e i casi bloccanti;
- verifica la presenza degli allegati principali e dei documenti nei `payments`;
- in modalità non dry run invoca l'endpoint `restart-attempt` su delivery-push-private.

Al termine produce un report con:
- totale processati;
- totale successful;
- totale blocked;
- riepilogo blocker con dettaglio requestId;
- dump JSON completo su file `report_<timestamp>.json`.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare 

```bash
aws sso login --profile <core-profile>
aws sso login --profile <confinfo-profile>
```


Avviare tunneling SSM tramite una EC2 dell'account AWS Core e dell'account AWS Confinfo verso gli ALB (fare riferimento alla [guida](https://pagopa.atlassian.net/wiki/spaces/PN/pages/706183466/Bastion+Host+SSM))

Aggiornare o creare il file .env con il valore ALB_BASE_URL e ALB_CONFIDENTIAL_URL in base alla porta locale impostata, ad es. 
ALB_BASE_URL=http://localhost:8080
ALB_CONFIDENTIAL_URL=http://localhost:8081

### Esecuzione
```bash
node index.js --envName <envName> --fileName <fileName> [--dryrun]
```
Dove:
- `<envName>` è l'environment sul quale si intende effettuare l'operazione (es. `test`, `uat`, `prod` in base ai profili disponibili).
- `<fileName>` è il path del file CSV di input.
- `--dryrun` (opzionale) esegue solo i controlli senza invocare la `restart-attempt`.

### Formato file input

Il file di input deve essere un CSV con header:

```csv
requestId,task,reason
PREPARE_ANALOG_DOMICILE.IUN_...RECINDEX_0.ATTEMPT_1,PN-12345,Restart completo dell'attempt per anomalia nel processo di stampa
```

Note:
- `requestId` è obbligatorio;
- `task` e `reason` sono usati nella chiamata API `restart-attempt` quando non è attivo `--dryrun`;
- `recIndex` e `attemptId` sono estratti automaticamente dal `requestId`.