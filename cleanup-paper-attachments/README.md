# Cleanup Paper Attachments

Questo documento descrive dettagliatamente come eseguire lo script di cleanup Paper Attachments direttamente in ambiente AWS.

---

## Prerequisiti

Assicurati di avere installati localmente:

* AWS CLI configurata con accesso al tuo ambiente AWS di produzione.
* Node.js e npm

---

## Installazione dipendenze

Dalla cartella principale del progetto esegui:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/credential-providers dotenv cli-progress
```

Assicurati di includere sempre nel repository i file:

* `package.json`
* `package-lock.json`

---

## Configurazione AWS

Configura AWS CLI con il tuo profilo di produzione:

```bash
aws configure --profile tuo_profilo_aws
```

Assicurati che il profilo configurato abbia i permessi corretti per accedere al bucket S3.

---

## Configurazione `.env`

Assicurati che il parametro `LOCALSTACK_ENDPOINT` sia commentato (disabilitato):

```env
AWS_PROFILE=tuo_profilo_aws
AWS_REGION=eu-central-1
BUCKET_NAME=nome-del-bucket-produzione
RETENTION_DAYS=120
#LOCALSTACK_ENDPOINT=http://localhost:4566
```

---

## Esecuzione dello script principale

Esegui direttamente lo script Node.js dalla cartella principale:

```bash
node index.js
```

Verifica che lo script completi la bonifica con successo.

---

## Verifica risultati con AWS CLI

Per verificare rapidamente lo stato degli oggetti S3, usa AWS CLI:

```bash
aws --profile tuo_profilo_aws s3api list-object-versions --bucket nome-del-bucket-produzione
```

Verifica che:

* Gli oggetti più vecchi della retention definita abbiano il delete marker.
* Gli oggetti più recenti siano mantenuti.

---

## Checklist finale

* [x] Ambiente AWS configurato correttamente
* [x] Dipendenze Node.js installate
* [x] Script Node.js
* [x] Risultati verificati con AWS CLI

