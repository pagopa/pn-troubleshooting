# recovery_dp-inputs

Ricreare eventi di notification view della coda SQS delivery push inputs a partire da un file

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Ricreare eventi di notification view della coda SQS delivery push inputs a partire da un file

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
node index.js --envName <env-name> --fileName <file-name> 

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` file contenente la lista dei requestId