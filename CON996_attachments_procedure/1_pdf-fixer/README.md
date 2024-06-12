## Esecuzione
node index.js <input-file> <aws-account-id> <env>

Il file di input è nel formato JSON-line
```
{"iun":"<iun>","requestId":"PREPARE_ANALOG_DOMICILE.IUN_<iun>>.RECINDEX_0.ATTEMPT_0","sentAt":null,"attachments":["PN_NOTIFICATION_ATTACHMENTS-1.pdf","PN_NOTIFICATION_ATTACHMENTS-2.pdf"]}
```

## Output
Genera un output nel seguente formato
```
{ "<fileKey>": "<localFilePath>" }
```
dove <fileKey> è la fileKey dell'attachment e <localFilePath> è il path al file PDF trasformato.