# remove from paper error

Consente di rimuovere dalla tabella pn-PaperRequestError le requestId afferenti IUN annullati.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Consente di rimuovere dalla tabella pn-PaperRequestError le requestId afferenti IUN annullati.

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
node index.js --envName <envName> --fileName <fileName>
```

Dove:
- `<envName>` l'env dove viene eseguito lo script;
- `<fileName>` file dato in input allo script; formato del file è un dump di DynamoDB generato dallo script dump_sqs di pn-troubleshooting.

