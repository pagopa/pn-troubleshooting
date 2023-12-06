# dump_dynamoDB

Script di Scan che esegue un dump della tabella DynamoDB.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, data in input il nome di tabella DynamoDB effettua una scan e fornisce un file contenente tutti gli elementi di quella tabella.

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
Lo script genera un file in formato JSON contenente i gli elementi estratti dalla tabella in input nel seguente avente come nome numeroDiElementi_nomeDellaTabella_profiloUtilizzato.json