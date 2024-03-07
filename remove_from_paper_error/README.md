# remove from paper error

Vuoi rimuovere dei requestId dalla tabella dynamo pn-PaperRequestError

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Rimuove dalla tabella dynamo pn-PaperRequestError i requestId forniti in input.

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
node index.js --envName <envName> --fileName <fileName>
```
Dove:
- `<envName>` l'env dove viene eseguito lo script;
- `<fileName>` file dato in input allo script;

formato del file
PREPARE_ANALOG_DOMICILE.IUN_XXXX-XXXX-XXXX-202310-L-1.RECINDEX_0.ATTEMPT_0
PREPARE_ANALOG_DOMICILE.IUN_XXXX-XXXX-XXXX-202310-U-1.RECINDEX_0.ATTEMPT_0
PREPARE_ANALOG_DOMICILE.IUN_XXXX-XXXX-XXXX-202310-K-1.RECINDEX_0.ATTEMPT_0