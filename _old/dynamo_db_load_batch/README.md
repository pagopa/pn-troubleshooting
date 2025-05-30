# dynamo_db_load_batch

Script di inserimento batch in dynamo db da file
## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input un file correttamente configurato con elementi marshalled di dynamo, effettua l'inserimento a gruppi di n elementi nella relativa dynamoDB.

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
node Usage: index.js --profile <profile> --tableName <tableName> --fileName <fileName> [--batchDimension <batchDimension] 
```
Dove:
- `<profile>` è il profilo dell'account AWS;
- `<tableName>` é la tabella in cui vengono inseriti i dati
- `<fileName>` è il path del file che contiene i dati.
- `<batchDimension>` è la dimensione del batch che si vuole sottomettere (default:25)

Example of file:
{"idx1":{"S":"value1"},"idx2":{"S":"value2"},"idx2":{"S":"value3"}}
{"idx1":{"S":"value1"},"idx2":{"S":"value2"},"idx2":{"S":"value3"}}
.
.
.
{"idx1":{"S":"value1"},"idx2":{"S":"value2"},"idx2":{"S":"value3"}}