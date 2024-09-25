# temporary_fix_automation_script_dp-inputs

script che inserisce in una coda SQS (standard o fifo) degli elementi a partire da un file

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

script che inserisce in coda degli elementi a partire da un file

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node index.js --envName <env-name> [--region <region>] --fileName <file-name> --outputQueue <output-queue> [--dryrun]

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script.
-  `<region>` region su cui exportare il DUMP sulla coda. Opzionale, di default è eu-south-1 (Milano).
- `<file-name>` file DUMP di una coda SQS in formato JSON inline.
- `<output-queue>` nome della coda SQS su cui inviare gli eventi. Può essere una coda standard o fifo.
- `<dryrun>` per eseguire in readonly mode.