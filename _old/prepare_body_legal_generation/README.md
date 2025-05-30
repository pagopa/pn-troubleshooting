# prepare body legal generation

Script che prepara il body da sottomettere in pn-ss-availability-events-queue

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che prepara il body da sottomettere in pn-ss-availability-events-queue

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
- `<file-name>` file contenente le fileKey da elaborare