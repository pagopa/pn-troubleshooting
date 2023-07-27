## Scan on DynamoDB

Per poter avviare lo Script eseguire gli steps:

Installare dipendenze node:
`npm install`

Eseguire il comando:
`node check_dynamo.js <aws-profile> <dynamodb-table>`

Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<dynamodb-table>` é la tabella sulla quale si intende effettuare la scan.

Note: 
Lo Script, data in input una tabella DynamoDB e dopo aver configurato i parametri all'interno del codice effettua una scan che restituisce i risultati in base alle condizioni inserite.