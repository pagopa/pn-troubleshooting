# Check webhook events duplicated 

Script che verifica se degli eventi successivi ad una determinata sortkey webhook hanno il campo timeline duplicato

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che verifica se degli eventi successivi ad una determinata sortkey webhook hanno il campo timeline duplicato

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
node index.js --envName <env-name> --hashKey <hash-key> --sortKey <sort-key>

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<hash-key>` hash key del valore da ricercare
- `<sort-key>` sort key di partenza
