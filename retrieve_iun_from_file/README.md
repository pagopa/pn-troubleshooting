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
<FileName-0>
<FileName-1>
<FileName-2>

il file deve essere fornito con --timing 
<FileName-0>|<timing-0>
<FileName-1>|<timing-1>
<FileName-2>|<timing-2>