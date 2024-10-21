# legal_conservation_inject

Data l'estrazione di una serie di documenti, li si vuole iniettare sulla lambda di conservazione a norma.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Data l'estrazione di una serie di documenti, li si vuole iniettare sulla lambda di conservazione a norma.

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
node index.js --envName <env-name> --fileName <file-name> [--dryrun]

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<file-name>` file estratto da query che contiene i doc da sottomettere
- `--dryrun` se si vuole vedere solo l'output 