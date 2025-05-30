# paper_address_limit_correction

Script di bonifica dei dati in pn-paperAddress che hanno superato i 44 carattere in nameRow2

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script di bonifica dei dati in pn-paperAddress che hanno superato i 44 carattere in nameRow2

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
node index.js --envName <env-name> --fileName <file-name> [--backup] [--dryrun]

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` file contenente la lista dei requestId
- `<backup>` per ripristinare i dati di backup
- `<dryrun>` per eseguire in readonly mode