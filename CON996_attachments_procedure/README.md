## Step 0

### Input
txt/csv file contenente `<requestId>`, con suffisso PCRETRY_n, ad es. `PREPARE_ANALOG_DOMICILE.IUN_<iun>.RECINDEX_0.ATTEMPT_0.PCRETRY_1`

### Esecuzione
Esecuzione script `retrieve_attachments_from_requestid`:

`node index.js --envName <envName> --fileName <fileName>`

## Step 1

### Input:
Output step 0, ad es. 
```
{"iun":"<iun>","requestId":"PREPARE_ANALOG_DOMICILE.IUN_<iun>>.RECINDEX_0.ATTEMPT_0","sentAt":null,"attachments":["PN_NOTIFICATION_ATTACHMENTS-1.pdf","PN_NOTIFICATION_ATTACHMENTS-2.pdf"]}
```

### Esecuzione
Esecuzione `1_pdf-fixer`:

`node index.js <input-file> <aws-account-id> <env>`

## Step 2

### Input
Output file step 1, ad es. 
```
{ "<fileKey>": "<localFilePath>" }
```

### Esecuzione
Esecuzione `2_safestorage_uploader`:
`node index.js <inputFile>`

** Nota ** : per questo script è necessario avviare tunneling su ALB confinfo.

## Step 3

### Input
Output step 0.

### Esecuzione
`node index.js --envName <env-name> --fileName <file-name>`

## Step 4
TBC

## Step 5

### Input
Txt dove ogni riga è il requestId con il `PCRETRY_` che ci si aspetta.

Si può usare l'input dello step 0 ed incrementare il PCRETRY_.


### Esecuzione
Esecuzione scirpt `redrive_paper_event`:

```bash
node redrive_paper_events_massive.js --awsCoreProfile <aws-profile-core> --awsConfinfoProfile <aws-profile-confinfo> --file <file-path>

```
Dove:
- `<aws-profile-core>` è il profilo dell'account AWS core;
- `<aws-profile-confinfo>` è il profilo dell'account AWS confinfo;
- `<file-path>` è il path di un file csv con la lista dei requestId da processare (una sola colonna).

## Step 6
TBC