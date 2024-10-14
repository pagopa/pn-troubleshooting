# temporary_fix_automation_script_dp-actions

script che modifica lo stato di un documento in pn-SsDocumenti in attached

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

script che modifica lo stato di un documento in pn-SsDocumenti in attached

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
node index.js --envName <env-name> --fileName <file-name> --documentState <document-state> [--dryrun]

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` file contenente la lista dei documenti
- `<document-state>` stato in cui si vuole portare il documento in pn-SsDocumenti
- `<dryrun>` per eseguire in readonly mode