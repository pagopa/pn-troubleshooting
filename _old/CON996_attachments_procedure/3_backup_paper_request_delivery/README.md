## Esecuzione
`node index.js --envName <env-name> --fileName <file-name>`

Il file di input è nel formato JSON-line
```
{"iun":"<iun>","requestId":"PREPARE_ANALOG_DOMICILE.IUN_<iun>.RECINDEX_0.ATTEMPT_0","sentAt":null,"attachments":["PN_NOTIFICATION_ATTACHMENTS-1.pdf","PN_NOTIFICATION_ATTACHMENTS-2.pdf"]}
```

## Output
Dump file in `results/backup.json`