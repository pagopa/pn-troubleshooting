## Preparazione
Avviare tunnel con ALB Confinfo su porta 8888:

`aws --profile <aws-profile> ssm start-session --target "<target-id>>" --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "{\"portNumber\":[\"8080\"],\"localPortNumber\":[\"8888\"],\"host\":[\"alb.confidential.pn.internal\"]}"`

Dove `<target-id>` è l'ID del bastion host EC2 do Core e `<aws-profile>` è il profilo AWS.

## Esecuzione
`node index.js <inputFile>`

Dove `<inputFile>` è il file `report.json` prodotto dallo script `1_pdf-fixer`

## Output

Il file `report.json` nel formato
```
{
  "<original_file_key>": {
    "fileKey": "<new_file_key>",
    "checksum": "<new_checksum>",
    "date": "<new_date>>",
    "pdfFilePath": "<localPath>",
    "url": "<new_presigned_url>"
  }
}
```