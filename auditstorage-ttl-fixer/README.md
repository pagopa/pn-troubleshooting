# Bonifica TTL in pn-AuditStorage

Questo documento descrive dettagliatamente come eseguire lo script di Bonifica TTL sulla tabella Dynamo pn-AuditStorage 
in ambiente AWS utilizzando parametri da linea di comando.

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
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/credential-provider @aws-sdk/credential-provider-sso @js-temporal/polyfill cli-progress
```

---

## Configurazione AWS

Configura AWS CLI con il tuo profilo:

```bash
aws configure --profile tuo_profilo_aws
```

Assicurati che il profilo configurato abbia i permessi corretti per accedere al DynamoDB.

---

## Utilizzo dello script

### Guida rapida

Per visualizzare tutte le opzioni disponibili:

```bash
node index.js --help
```

### Parametri obbligatori

- `--aws-profile`: Profilo AWS da utilizzare
- `--aws-region`: Regione AWS (es: eu-south-1)  

### Parametri opzionali

- `--limit`: Limite oggetti da aggiornare (default: -1, nessun limite)
- `--log-file`: File di log per tracciare gli aggiornamenti (default: auditstorage-ttl-expiration-fix-log-TIMESTAMP.txt)
- `--dry-run`: Modalità simulazione (nessun aggiornamento)

---

## Esempi di utilizzo

### Esecuzione base in produzione

```bash
node index.js \
  --aws-profile produzione \
  --aws-region eu-south-1 
```

### Con parametri personalizzati

```bash
node index.js \
  --aws-profile produzione \
  --aws-region eu-south-1 \
  --limit 50 
```

### STEP PRELIMINARI all' Esecuzione in ambiente produzione 

**SEMPRE consigliato prima dell'esecuzione reale in produzione, assicurarsi di aver eseguito una copia di backup della tabella pn-AuditStorage di DynamoDB**

### 🚩 Esecuzione Dry Run (simulazione)

**SEMPRE consigliato prima dell'esecuzione reale in produzione:**

```bash
node index.js \
  --aws-profile produzione \
  --aws-region eu-south-1 \
  --dry-run
```

### Esempi per diversi ambienti

**Modalità simulata:**
```bash
node index.js \
  --aws-profile dev \
  --aws-region eu-south-1 \
  --dry-run
```

**Esecuzione con limitatore:**
```bash
node index.js \
  --aws-profile staging \
  --aws-region eu-south-1 \
  --limit 50
```

**Pulizia con prefisso personalizzato e log:**
```bash
node index.js \
  --aws-profile produzione \
  --aws-region us-south-1 \
  --log-file ./logs/bonificaTTL.log
```

**Test limitato con log personalizzato:**
```bash
node index.js \
  --aws-profile dev \
  --aws-region eu-south-1 \
  --limit 10 \
  --log-file ./logs/dev-test-bonificaTTL.log \
  --dry-run
```

---

## Sistema di logging

Lo script genera automaticamente un file di log che contiene:

### 📋 Intestazione informativa
- Timestamp di esecuzione
- Configurazione completa utilizzata (profilo, regione, etc.)
- Modalità di esecuzione (DRY RUN o REALE)

### 📊 Riepilogo dettagliato
- Totale records scansionati
- Numero di record aggiornati


### 📝 Esempio di log generato

```
AUDITSTORAGE TTL EXPIRATION FIX - ESECUZIONE
========================================================
Timestamp: 2025-05-23T10:30:00.000Z
AWS Profile: produzione
AWS Region: eu-south-1
Dynamo Table: pn-AuditStorage
Limite: Nessuno
Modalità: DRY RUN
========================================================

RIEPILOGO:
Totale records scansionati: 1250
Totale records aggiornati: 89
```

### 🎯 Nome file di log
- **Default**: `auditstorage-ttl-expiration-fix-log-YYYY-MM-DDTHH-MM-SS.txt`
- **Personalizzato**: Usa `--log-file percorso/nome-file.log`

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
  --aws-region eu-south-1 \
  --log-file ./logs/prod-bonificaTTL-dry-run.log \
  --dry-run

# 2. Test con limite basso per validare il comportamento
node index.js \
  --aws-profile prod \
  --aws-region eu-south-1 \
  --limit 10 \
  --log-file ./logs/prod-bonificaTTL-test-10.log

# 3. Esecuzione completa dopo la validazione
node index.js \
  --aws-profile prod \
  --aws-region eu-south-1 \
  --log-file ./logs/prod-full-bonificaTTL.log
```

---

## Monitoraggio e logging

Lo script fornisce output dettagliato durante l'esecuzione:

- Configurazione utilizzata
- Percorso del file di log generato
- Numero di records trovati 
- Progress bar durante l'elaborazione
- Riepilogo finale con statistiche di aggiornamento

Esempio di output:
```
CONFIGURAZIONE BONIFICA TTL sulla tabella Dynamo "pn-AuditStorage"
==================================================================
🟢 Avvio bonifica TTL tabella Dynamo "pn-AuditStorage"
🌍 AWS Profile: produzione
🌍 AWS Region: eu-south-1
📄 File di log: ./logs/prod-bonificaTTL.log
⚠️ ATTENZIONE: MODALITÀ SIMULAZIONE (DRY RUN) ATTIVATA.

📋 Trovati 1250 records 

RISULTATO ELABORAZIONE
==================================================================
📌 Records della tabella Dynamo "pn-AuditStorage": 1250
📁 Records aggiornati: 1161
📄 Log salvato in: ./logs/prod-bonificaTTL.log
```

---

## Checklist finale

* [x] Ambiente AWS configurato correttamente
* [x] Dipendenze Node.js installate  
* [x] Parametri obbligatori forniti
* [x] Dry run eseguito con successo
* [x] File di log generato e verificato
* [x] Risultati verificati con AWS CLI
* [x] Backup o snapshot della tabella Dynamo "pn-AuditStorage" (se necessario)
* [x] Monitoraggio post-esecuzione attivo