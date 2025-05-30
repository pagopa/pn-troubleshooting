# pdf validator

Script per verificare se un pdf è valido nel bucket di safe storage

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input l'output attachments.json dello script retrieve_attachments_from_iun verifica che i pdf correlati ad una notifica sono validi

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
node index.js --envName <env-name> --fileName <file-name>

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` output attachments.json dello script retrieve_attachments_from_iun
