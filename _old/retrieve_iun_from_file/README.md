# Retrieve IUN From file name

Script che preso in input un file che contengono una serie di file name restituisce i rispettivi iun e PA mittente

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script esegue delle query sulle tabelle dynamo db per recuperare lo iun di riferimento e PA mittente di un file di tipo AAR e LEGALFACT.

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
node index.js --envName <envName> --fileName <fileName> [--timing]
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<fileName>` è il file-path del file che riporta la lista dei filename ;
- `<timing>` indica se nel file è presente anche un time.

il file deve essere fornito senza --timing 
PN_LEGAL_FACTS-a37e919ffa9c412sb82f1e7082c1bf13.pdf
PN_LEGAL_FACTS-a37e919ffa9c412sb82f1e7082c1bqwe.pdf
PN_LEGAL_FACTS-a37e919ffa9c412sb82f1e7082c1b123.pdf

il file deve essere fornito con --timing 
PN_LEGAL_FACTS-a37e919ffa9c412sb82f1e7082c1bf13.pdf|2024-01-12 13:17:51.097
PN_LEGAL_FACTS-a37e919ffa9c4234b82f1e7082c1bf13.pdf|2024-01-09 13:17:51.097
PN_LEGAL_FACTS-a37e919ffa9c4xsfb82f1e7082c1bf13.pdf|2024-01-07 13:17:51.097