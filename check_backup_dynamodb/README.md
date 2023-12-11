# Check_Backup_DynamoDB

Script di aggiornamento dei file di backup di pn-infra
## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script confronta i file di backup presenti in pn-infra delle tabelle dynamo dopodiché fornisce in output le informazioni da inserire nel campo Resources dei file stessi e un dettaglio di quali sono state le tabelle che sono state inserite/rimosse.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile <profile>
```

### Esecuzione
```bash
node index.js --envName <envName> --folderPath <folderPath>
```
Dove:
- `<envName>` è l'ambiente sul quale si deve effettuare il controllo;
- `<folderPath>` é il path dove sono contenuti i file di backup dynamodb di pn-infra.