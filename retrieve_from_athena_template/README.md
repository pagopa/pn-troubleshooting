# Retrieve from athena template

Script che esegue query custom e salva i risultati in un csv

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che esegue query custom e salva i risultati in un csv

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
node index.js --envName <envName> --query <query> 
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<query>` è il nome della query da eseguire;