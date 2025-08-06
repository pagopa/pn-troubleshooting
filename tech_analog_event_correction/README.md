# Tech analog event correction

Script che corregge la tabella pn-paperEvents in caso di errori dai recapitisti

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Script che corregge la tabella pn-paperEvents in caso di errori dai recapitisti

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
- `<env-name>` l'ambiente su cui verrà eseguito lo script;
- `<file-name>` file fornito da postalizzazione;

