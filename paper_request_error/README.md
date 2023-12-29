# Paper Request Error cleanup script

Script per la pulizia della tabella pn-PaperRequestError

## Tabella dei Contenuti

- [Paper Request Error cleanup script](#paper-request-error-cleanup-script)
  - [Tabella dei Contenuti](#tabella-dei-contenuti)
  - [Descrizione](#descrizione)
  - [Installazione](#installazione)
  - [Utilizzo](#utilizzo)
    - [Step preliminare](#step-preliminare)
    - [Esecuzione](#esecuzione)

## Descrizione

Lo Script, dato in input un intervallo di date sul quale filtrare gli elementi della tabella
in base alla data del campo `created`:

1) Cancella l'elemento dalla tabella se la notifica correlata è stata annullata.
2) ....

## Installazione

```bash
npm install
```

## Utilizzo

### Step preliminare

```bash
aws sso login --profile sso_pn-core-<prod>
```

### Esecuzione

```bash
node cleanPaperReqErrorCancelled.js <aws-core-profile> <start-date> <end-date>
```

Dove:
- `<aws-core-profile>` è il profilo dell'account AWS core;
- `<start-date>` è la data inizio rispetto l'elemento created; 
- `<end-date>` è la data fine rispetto l'elemento created;