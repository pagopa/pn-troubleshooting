# Scan on DynamoDB table

Script di Scan di una tabella DynamoDB.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, data in input il nome di tabella DynamoDB e dopo aver configurato i parametri all'interno del codice effettua una scan che restituisce i risultati in base alle condizioni inserite.

## Installazione

```bash
npm install
```

## Utilizzo

```bash
node scan_dynamo.js --awsProfile <aws-profile> --tableName <dynamodb-table>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS dell'ambiente di riferimento.
- `<dynamodb-table>` é la tabella sulla quale si intende effettuare una scan.

## Output
Lo script genera un file in formato JSON `{table_name}_{yyyy-MM-dd'T'HH:mm:ss. SSSXXX}.json` con il risultato ottenuto dalla Scan eseguita.


