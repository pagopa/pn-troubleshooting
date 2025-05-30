# Tech stop analog notification unlock

Rimuove il PN999 dallo statusRequest portandolo allo stato P000

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Rimuove il PN999 dallo statusRequest portandolo allo stato P000

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
node index.js --envName <env-name> --fileName <file-name> [--dryrun]
```
Dove:
- `<env-name>` l'ambiente su cui verrà eseguito lo script;
- `<file-name>` file che contiene i requestId completi di PC_RETRY;
- `--dryrun` esecuzione in dryrun mode.

