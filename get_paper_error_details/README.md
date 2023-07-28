## Get Paper delivery information

Per poter avviare lo Script eseguire gli steps:

Installare dipendenze node:
`npm install`

Eseguire il comando:
`node index.js <aws-profile-dev> <aws-profile-confinfo> <request-id>`

Dove:
- `<aws-profile-dev>` è il profilo dell'account AWS dev;
- `<aws-profile-conf>` è il profilo dell'account AWS confinfo;
- `<request-id>` è il request id del messaggio desiderato.

Note: 
Lo Script, dato in input un requestId, raccoglie i dati dalle seguenti tabelle dynamo:
1) pn-PaperRequestError
2) pn-PaperRequestDelivery
3) pn-PaperAddress
4) pn-EcRichieste
5) pn-PaperEvents

Dopodiché analizza decodifica i dati e li restituisce in formato JSON.
