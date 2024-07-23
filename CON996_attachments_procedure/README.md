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
### Step preliminare
Recuperare gli atti a partire dai requestId forniti mediante script "retrieve_attachments_from_requestid" il quale darà in output un file contenente gli attachments dei requestId "atti.json"

### Input
Gli input sono i seguenti:
- <env-name> ambiente di esecuzione (ex: uat, prod)
- <attachments-file> path del file ottenuto dallo step preliminare
- <data-file> path del file ottenuto dallo step 2
- <cache-file> [opzionale] da utilizzare nel caso in cui lo script si interrompe inavvertitamente usando l'output temporaneo
- <dryrun> [opzionale] nel caso in cui non si voglia procedere in modalità dryrun

### Esecuzione
Esecuzione `4_updatePaperRequestDelivery`:
`node index.js --envName <env-name> --attachmentsFile <attachments-file> --dataFile <data-file> [--cacheFile <cache-file> --dryrun]`

### Output
In output viene fornito un file contenete un JSON con tutti i file modificati nello stesso formato dello step 2

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
### Input
Gli input sono i seguenti:
- <env-name> ambiente di esecuzione (ex: uat, prod)
- <attachments-file> path del file ottenuto dallo step preliminare
- <data-file> path del file ottenuto dallo step 4
### Esecuzione
Esecuzione `4_updatePaperRequestDelivery`:
`node index.js --envName <env-name> --attachmentsFile <attachments-file> --dataFile <data-file>`

