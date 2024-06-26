# Check ttl expiration

Script che verifica la ttl per determinati RequestID in pn-PaperAddress fornendo in output i giorni rimanenti e la data

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che verifica la ttl per determinati RequestID in pn-PaperAddress fornendo in output i giorni rimanenti e la data

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
