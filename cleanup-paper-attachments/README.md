# Cleanup Paper Attachments

Questo documento descrive dettagliatamente come eseguire lo script di cleanup Paper Attachments in ambiente AWS utilizzando parametri da linea di comando.

---

## Prerequisiti

Assicurati di avere installati localmente:

* AWS CLI configurata con accesso al tuo ambiente AWS
* Node.js e npm

---

## Installazione dipendenze

Dalla cartella principale del progetto esegui:

```bash
npm install
```

Oppure manualmente:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/credential-providers cli-progress
```

---

## Configurazione AWS

Configura AWS CLI con il tuo profilo:

```bash
aws configure --profile tuo_profilo_aws
```

Assicurati che il profilo configurato abbia i permessi corretti per accedere al bucket S3.

---

## Utilizzo dello script

### Guida rapida

Per visualizzare tutte le opzioni disponibili:

```bash
node index.js --help
```

### Parametri obbligatori

- `--aws-profile`: Profilo AWS da utilizzare
- `--aws-region`: Regione AWS (es: eu-central-1)
- `--bucket-name`: Nome del bucket S3

### Parametri opzionali

- `--retention-days`: Giorni di retention (default: 120)
- `--prefix-filter`: Prefisso oggetti da filtrare (default: PN_PAPER_ATTACHMENT)
- `--limit`: Limite oggetti da eliminare (default: -1, nessun limite)
- `--dry-run`: Modalità simulazione (nessuna eliminazione)

---

## Esempi di utilizzo

### Esecuzione base in produzione

```bash
node index.js \
  --aws-profile produzione \
  --aws-region eu-central-1 \
  --bucket-name my-production-bucket
```

### Con parametri personalizzati

```bash
node index.js \
  --aws-profile produzione \
  --aws-region eu-central-1 \
  --bucket-name my-production-bucket \
  --retention-days 90 \
  --limit 100 \
  --prefix-filter DOCUMENT_ATTACHMENT
```

### 🚩 Esecuzione Dry Run (simulazione)

**SEMPRE consigliato prima dell'esecuzione reale in produzione:**

```bash
node index.js \
  --aws-profile produzione \
  --aws-region eu-central-1 \
  --bucket-name my-production-bucket \
  --dry-run
```

### Esempi per diversi ambienti

**Esecuzione simulata:**
```bash
node index.js \
  --aws-profile dev \
  --aws-region eu-central-1 \
  --bucket-name dev-attachments-bucket \
  --retention-days 30 \
  --dry-run
```

**Esecuzione con limitatore:**
```bash
node index.js \
  --aws-profile staging \
  --aws-region eu-west-1 \
  --bucket-name staging-attachments-bucket \
  --retention-days 60 \
  --limit 50
```

**Pulizia con prefisso personalizzato:**
```bash
node index.js \
  --aws-profile produzione \
  --aws-region us-east-1 \
  --bucket-name attachments-bucket \
  --prefix-filter LEGACY_DOCUMENTS \
  --retention-days 120
```

---

## Verifica risultati con AWS CLI

Per verificare rapidamente lo stato degli oggetti S3, usa AWS CLI:

```bash
aws --profile tuo_profilo_aws s3api list-objects-v2 \
  --bucket nome-del-bucket \
  --prefix PN_PAPER_ATTACHMENT
```

Oppure per vedere i dettagli con data di modifica:

```bash
aws --profile tuo_profilo_aws s3 ls s3://nome-del-bucket/PN_PAPER_ATTACHMENT --recursive
```

---

## Workflow consigliato per produzione

1. **Dry Run** per verificare cosa verrebbe eliminato
2. **Esecuzione limitata** con `--limit` per test incrementali
3. **Esecuzione completa** solo dopo aver verificato i risultati
4. **Monitoraggio** dei risultati post-esecuzione

```bash
# 1. Dry run per vedere cosa verrebbe eliminato
node index.js \
  --aws-profile prod \
  --aws-region eu-central-1 \
  --bucket-name prod-bucket \
  --dry-run

# 2. Test con limite basso per validare il comportamento
node index.js \
  --aws-profile prod \
  --aws-region eu-central-1 \
  --bucket-name prod-bucket \
  --limit 10

# 3. Esecuzione completa dopo la validazione
node index.js \
  --aws-profile prod \
  --aws-region eu-central-1 \
  --bucket-name prod-bucket
```

---

## Monitoraggio e logging

Lo script fornisce output dettagliato durante l'esecuzione:

- Configurazione utilizzata
- Numero di oggetti trovati con il prefisso specificato
- Progress bar durante l'elaborazione
- Riepilogo finale con statistiche di eliminazione

Esempio di output:
```
CONFIGURAZIONE CLEANUP
==================================================================
🟢 Avvio cleanup bucket "prod-bucket" per oggetti con prefisso "PN_PAPER_ATTACHMENT"
⏱️ Età minima per eliminazione: 120 giorni
🌍 AWS Profile: produzione
🌍 AWS Region: eu-central-1
⚠️ ATTENZIONE: MODALITÀ SIMULAZIONE (DRY RUN) ATTIVATA.

📋 Trovati 1250 oggetti con prefisso "PN_PAPER_ATTACHMENT"

RISULTATO ELABORAZIONE
==================================================================
📌 Oggetti con prefisso "PN_PAPER_ATTACHMENT": 1250
🗑️ Oggetti eliminati: 89
📁 Oggetti mantenuti: 1161
```

---

## Checklist finale

* [x] Ambiente AWS configurato correttamente
* [x] Dipendenze Node.js installate
* [x] Parametri obbligatori forniti
* [x] Dry run eseguito con successo
* [x] Risultati verificati con AWS CLI
* [x] Backup o snapshot del bucket (se necessario)
* [x] Monitoraggio post-esecuzione attivo