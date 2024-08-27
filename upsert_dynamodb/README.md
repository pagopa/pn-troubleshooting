# Upsert DynamoDB

Script che aggiorna o inserisce in dynamoDB i valori contenuti nel file in input (dump).

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che aggiorna o inserisce in dynamoDB i valori contenuti nel file in input (dump)

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
node index.js --envName <env-name> --account <account> --tableName <table-name> --fileName <file-name>

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<account>` account sul quale si intende inserire l'upsert
- `<table-name>` nome della tabella sul quale si vuole inserire l'aggiornamento
- `<file-name>` file contenente la lista dei requestId