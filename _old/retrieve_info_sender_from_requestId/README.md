# Retrieve Info Sender From RequestId
Recupera le informazioni come senderId, PA mittente e data invio della notifica a partire da un requestId.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script recupera le informazioni della PA e la data di invio di una notifica a partire dal requestId.

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
