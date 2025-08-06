# Extract_check_stock

Script che verifica la differenza di giorni che intercorrono tra inesito e statusCode 

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che verifica la differenza di giorni che intercorrono tra inesito e statusCode 

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
node index.js --envName <env-name> --fileName <file-name> --statusCode <status-code> --days <days>
```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` file contenente la lista dei requestId
- `<status-code>` status code da ricercare
- `<status-code>` giorni di differenza