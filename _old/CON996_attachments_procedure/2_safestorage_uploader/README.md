## Preparazione
Avviare tunnel con ALB Confinfo su porta 8888:

`aws --profile <aws-profile> ssm start-session --target "<target-id>>" --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "{\"portNumber\":[\"8080\"],\"localPortNumber\":[\"8888\"],\"host\":[\"alb.confidential.pn.internal\"]}"`

Dove `<target-id>` è l'ID del bastion host EC2 do Core e `<aws-profile>` è il profilo AWS.

Impostare variabile d'ambiente SAFESTORAGE_URL a http://localhost:8888

Se si esegue dal EC2 di Core, il valore della variabile d'ambiente sarà http://alb.confidential.pn.internal:8080

## Esecuzione
`node index.js <inputFile> <cacheFile>`

Dove `<inputFile>` è il file `report.json` prodotto dallo script `1_pdf-fixer` e `<cacheFile>` è un file nel formato dell'output da dare in input nel caso in cui l'esecuzione si fosse fermata nel mezzo. Di default si può fornire un file con il contenuto `{}` .

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