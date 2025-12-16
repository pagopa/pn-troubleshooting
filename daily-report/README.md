# Daily Report

Script che estrae dagli environment informazioni relative allo status dell'environment (Code DLQ, Tabelle di errore come Pn-RequestError).

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script estrae informazioni di dati sull'environment passato in input.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node ./index.js --envName <env-name> [--json] 

```
Dove:
- `<env-name>` è l'environment sul quale si intende estrarre informazioni; (obbligatorio)
- `--json` abilita l'output in formato JSON (facoltativo, non abilitato di default) 

Usage Example:
```bash
node ./index.js --envName dev 
node ./index.js --envName dev --json
```
