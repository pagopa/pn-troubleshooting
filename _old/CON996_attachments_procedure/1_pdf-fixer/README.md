## Esecuzione
`node index.js <input-file> <aws-account-id> <env> <margin-percentage> <dpi> <force-portrait>`

Il file di input è nel formato JSON-line
```
{"iun":"<iun>","requestId":"PREPARE_ANALOG_DOMICILE.IUN_<iun>>.RECINDEX_0.ATTEMPT_0","sentAt":null,"attachments":["PN_NOTIFICATION_ATTACHMENTS-1.pdf","PN_NOTIFICATION_ATTACHMENTS-2.pdf"]}
```

## Parametri

- `<margin-percentage>`: valore tra zero e 100 per riduzione dei margini, impostare a zero per non eseguire la trasformazione
- `<dpi>` : valore di DPI nella rasterizzazione del PDF, impostare a zero per non eseguire la stampa
- `<force-portrait>` : se `true` , lo script controlla se la pagina è in landscape e la forza in portrait mode

## Output
Genera un output nel seguente formato
```
{ "<fileKey>": "<localFilePath>" }
```
dove`<fileKey>` è la fileKey dell'attachment e `<localFilePath>` è il path al file PDF trasformato
