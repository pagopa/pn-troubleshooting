## Prerequisito
Aprire il tunneling verso l'env contenente pdfraster
`aws ssm start-session --target "<target_id>" --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "{\"portNumber\":[\"8080\"],\"localPortNumber\":[\"8080\"],\"host\": [\"<host>\"]}" --profile <profile>`

## Esecuzione
` node index.js --envName <envName> --fileName <fileName> --accountConfinfoId <accountConfinfoId>`

Il file di input è nel formato JSON-line
```
{"iun":"<iun>","requestId":"PREPARE_ANALOG_DOMICILE.IUN_<iun>>.RECINDEX_0.ATTEMPT_0","sentAt":null,"attachments":["PN_NOTIFICATION_ATTACHMENTS-1.pdf","PN_NOTIFICATION_ATTACHMENTS-2.pdf"]}
```

## Parametri

- `<envName`: l'environment sul quale si intende eseguire l'operazione
- `<fileName>`: path del file da fornire in input
- `<accountConfinfoId>`: account id per costruire il nome del bucket nel quale recuperare i pdf

## Output
Genera un output nel seguente formato
```
{ "<fileKey>": "<localFilePath>" }
```
dove`<fileKey>` è la fileKey dell'attachment e `<localFilePath>` è il path al file PDF trasformato
