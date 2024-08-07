# find discovered address

Script che verifica che per una serie di requestId c'è un event in pn-ecRichiesteMetadata che contiene il discovered address valorizzato

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che verifica che per una serie di requestId c'è un event in pn-ecRichiesteMetadata che contiene il discovered address valorizzato

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
