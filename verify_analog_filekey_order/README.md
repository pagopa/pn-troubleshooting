# Verify analog filekey order

Script che dato in input un csv, verifica che per una requestId (considerando l'ultimo pcretry) l'order 1 degli attachment in pn-EcRichieste è quello fornito in input nel csv

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che dato in input un csv, verifica che per una requestId (considerando l'ultimo pcretry) l'order 1 degli attachment in pn-EcRichieste è quello fornito in input nel csv

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
- `<envName>` è l'environment si intende eseguire la procedura;
- `<fileName>` è il file-path del csv ;

il file deve essere fornito nel seguente formato
"prepareRequestId", "docs"
<requestIdSenzaPcRetry>, <fileKey>