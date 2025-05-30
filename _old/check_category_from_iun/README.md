# Check category from iun

Script che verifica se una category è presente in timeline

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che verifica se una category è presente in timeline

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
node index.js --envName <env-name> --fileName <file-name> --category <category>

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` file contenente la lista di iun
- `<category>` category che si vuole ricercare