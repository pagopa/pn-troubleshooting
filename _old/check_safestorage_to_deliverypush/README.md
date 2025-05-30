# check_safestorage_to_deliverypush

Script che fornisce in output, la timeline degli iun che riguardano i legalfact forniti in input

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che fornisce in output, la timeline degli iun che riguardano i legalfact forniti in input

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