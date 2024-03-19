# Retrieve Info From Timelines
Recupera informazioni specifiche a partire da IUN e Timeline events.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script recupera informazioni specifiche a partire da IUN e Timeline events. Fornendo in output file che raggruppano determinate tipologie e possono essere utilizzati per opportune verifica.

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
- `<envName>` è l'environment si intende eseguire la procedura;
- `<fileName>` è il file-path del file che riporta i requestId di interesse;
