# Retrieve fromd dynamo by pk

Script che recupera le info tramite query da una tabella dynamo

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che recupera le info tramite query da una tabella dynamo

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
node index.js --envName <env-name> --account <account> --fileName <file-name> --tableName <table-name> --keyName <key-name> [--prefix <prefix> --suffix <suffix>]

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<account>` l'account di intervento
- `<file-name>` file contenente la lista di pk
- `<table-name>` nome della tabella sul quale ricercare
- `<key-name>` nome della pk della tabella dynamo
- `<prefix>` prefisso da inserire al valore della pk da ricercare
- `<suffix>` suffisso da inserire al valore della pk da ricercare