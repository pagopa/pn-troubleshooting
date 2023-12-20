# Scan on DynamoDB table

Script di generazione messaggi sulla coda `pn-delivery_push_inputs.fifo` in caso di eventi DynamoDB Stream mancanti come input della lambda pn-delivery-insert-trigger-lambda`.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo script, dato in input il file json risultante dall'esecuzione dello script `timelines_from_iuns`, invia alla coda `pn-delivery_push_inputs.fifo` i messaggi formattati come se fossero generati dalla lambda `pn-delivery-insert-trigger-lambda`.
Lo script prenderà in considerazione solo gli elementi con 0 elementi di Timeline.

## Installazione

```bash
npm install
```

## Utilizzo

```bash
node index.js --awsProfile <aws-profile> --file <json-file>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS dell'ambiente di riferimento.
- `<json-file>` é la il path al file risultante dall'esecuzione dello script `timelines_from_iuns`
