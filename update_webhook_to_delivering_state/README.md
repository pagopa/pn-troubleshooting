# update_webhook_to_delivering_state

script che imposta a DELIVERING gli status degli eventi in pn-WebhookEvents

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

script che imposta a DELIVERING gli status degli eventi in pn-WebhookEvents

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
node index.js --accountType <account-type> --envName <env-name> --fileName <file-name> [--dryrun]
```
Dove:
- `<account-type>` l'account sul quale si intende avviare lo script
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` file contenente la lista dei documenti
- `<dryrun>` per eseguire in readonly mode