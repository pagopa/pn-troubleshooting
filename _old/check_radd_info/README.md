# check_radd_info

Script che recupera le informazioni relative ad un soggetto RADD

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Script che recupera le informazioni di un soggetto radd da pn-radd-transaction-alt e scarica il file contenuto al suo interno.

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
node index.js --envName <envName> --cf <fiscalcode> --operationId <operation-id> 
```
Dove:
- `<fiscalcode>` è codice fiscale del soggetto RADD;
- `<operation-id>` è l'operation id indicata;
