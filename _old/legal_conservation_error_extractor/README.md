# Legal Conservation Error Extractor

Script che estrae dalla tabella dynamoDB i file non correttamente conservati a norma.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script estrae dalla tabella dynamo i record contenenti i file che non sono stati conservati a norma.

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
node ./index.js --envName <env-name> --startDate <startDate> [--endDate <endDate>]

```
Dove:
- `<env-name>` è l'environment sul quale si intende estrarre informazioni; (obbligatorio)
- `<startDate>` indica l'indice di ricerca che si vuole utilizzare ed è rappresentato come YYYYMM; (obbligatorio)
- `<endDate>` parametro opzionale che indica di ricercare in un range temporale dato da <startDate> a <endDate> rappresentato come YYYYMM; (opzionale)

Usage Example:
```bash
node ./index.js --envName dev --startDate 202308 --endDate 202310
```