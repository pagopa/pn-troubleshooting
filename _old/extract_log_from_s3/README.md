# Download log fron S3

Script che esegue il download dei bucket dei log di un singolo giorno

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Requisiti](#Requisiti)
- [Esecuzione](#utilizzo)

## Descrizione

Lo Script, dato in input due date (inizio e fine) nel formato YYYY-MM-DD-HH, effettua il download di tutti i log della giornata e ora selezionata da AWS S3


## Requisiti
7z installato per poterlo utilizzare da linea di comando

### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
 ./extract_log_from_s3.sh -p <aws-profile> -d <start-datelog> -e <end-datelog>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<start-datelog>` data in formato YYYY-MM-DD-HH;
- `<end-datelog>` data in formato YYYY-MM-DD-HH;

