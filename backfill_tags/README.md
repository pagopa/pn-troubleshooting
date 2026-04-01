# Backfill CloudWatch Logs 'Microservice' Tag

Questo set di script permette di identificare e taggare massivamente i log group di CloudWatch che non possiedono il tag `Microservice`.

## Prerequisiti e Componenti Necessari

Prima di eseguire gli script, assicurati di avere installato e configurato i seguenti componenti:

- **Bash**: Gli script sono scritti per ambiente Bash (Linux, macOS o WSL su Windows).
- **AWS CLI (v2 consigliata)**: Installata e raggiungibile nel PATH.
- **Sessione SSO Attiva**: Un profilo AWS configurato con i permessi necessari (`logs:DescribeLogGroups`, `logs:ListTagsLogGroup`, `logs:TagLogGroup`, `sts:GetCallerIdentity`).

## Struttura
1.  `check_no_tags.sh`: Scansiona l'account e genera un CSV dei log group mancanti.
2.  `fill_tags.sh`: Legge il CSV compilato e applica i tag su AWS.

---

## Step 1: Identificazione (Generazione CSV)

Esegui lo script per estrarre la lista dei log group senza tag.

```bash
chmod +x check_no_tags.sh
./check_no_tags.sh -r <aws-region> -p <aws-profile>
```

**Esempio:**
```bash
./check_no_tags.sh -r eu-south-1 -p sso_pn-confinfo-prod-ro
```

Lo script creerà una cartella `output_<ACCOUNT_ID>` contenente un file `<ACCOUNT_ID>.csv`.

---

## Step 2: Compilazione Manuale

Apri il file CSV generato. Troverai una lista simile a questa:
```csv
Log Group Name,Microservice Tag (Manual Input Required)
/aws-glue/crawlers,
/aws-glue/jobs/error,
```

Inserisci manualmente il valore del servizio dopo la virgola:
```csv
Log Group Name,Microservice Tag (Manual Input Required)
/aws-glue/crawlers,pn-infra-cloudwatchlogs
/aws-glue/jobs/error,pn-infra-cloudwatchlogs
```

---

## Step 3: Backfill (Applicazione Tag)

Una volta salvato il CSV, esegui lo script di backfill.

### Test (Dry Run)
Si consiglia vivamente di eseguire prima un test per vedere quali comandi verrebbero lanciati:
```bash
chmod +x fill_tags.sh
./fill_tags.sh -r <aws-region> -p <aws-profile> -f <path-to-csv> --dry-run
```

### Esecuzione Reale
Se il dry run è corretto, applica i tag:
```bash
./fill_tags.sh -r <aws-region> -p <aws-profile> -f <path-to-csv>
```

---

## Note
- Gli script utilizzano la AWS CLI. Assicurati di avere una sessione SSO attiva per il profilo utilizzato.
- Lo script `fill_tags.sh` salta automaticamente la prima riga (header) del CSV.
