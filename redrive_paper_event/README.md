## Redrive of paper failed 

***ATTENZIONE***

Lo script è altamente invasivo. Quindi procedere solo se si ha le competenze tecniche necessarie.

Per poter avviare lo Script eseguire gli steps:

Installare dipendenze node:
    
    npm install

Eseguire il comando:

    node index.js <aws-profile-dev> <aws-profile-confinfo> <request-id>

Dove:
- `<aws-profile-dev>` è il profilo dell'account AWS dev;
- `<aws-profile-conf>` è il profilo dell'account AWS confinfo;
- `<request-id>` è il request id del messaggio desiderato.

Note: 
Lo Script, dato in input un requestId, sostituisce in tabella "pn-PaperRequestError" il `<requestId>` con `<requestId>_TMP`.
Effettua l'invio del messaggio nella coda SQS `pn-paper_channel_requests` in due versioni V1 e V2. (TO_UPDATE)
