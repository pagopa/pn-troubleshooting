# Verify ss file events

Script che verifica se un file è presente nel bucket di safestorage ed è stato eliminato dal bucket di staging

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script scarica la lista dei bucket di interesse, dopodiché cicla per individuare se il file ha seguito gli eventi corretti.

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
- `<fileName>` è il file-path del file che riporta la lista dei filename ;

il file deve essere fornito nel seguente formato
PN_LEGAL_FACTS-a37e919ffa9c412sb82f1e7082c1bf13.pdf
PN_LEGAL_FACTS-a37e919ffa9c412sb82f1e7082c1bqwe.pdf
PN_LEGAL_FACTS-a37e919ffa9c412sb82f1e7082c1b123.pdf