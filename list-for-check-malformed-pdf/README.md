# Scan on DynamoDB table

Script di Scan sulla tabella DynamoDB pn-DocumentCreationRequest per estrarre tutti i documenti di tipo DIGITAL_DELIVERY.

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
node scan_dynamo.js --awsProfile <aws-profile>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS dell'ambiente di riferimento.

## Output
Lo script genera un file in formato JSON `{table_name}_{yyyy-MM-dd'T'HH:mm:ss. SSSXXX}.json` con il risultato ottenuto dalla Scan eseguita.