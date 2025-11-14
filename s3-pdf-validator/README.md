# S3 PDF Validator

Valida oggetti S3 come PDF verificando i magic bytes. Gestisce milioni di file con streaming, processing concorrente e checkpoint automatico.

## Requisiti

- Node.js >= 22.0.0
- Credenziali AWS SSO configurate

## Installazione

```bash
cd s3-pdf-validator
npm install
```

## Utilizzo

### Comando Base

```bash
node index.js \
  --inputFile filekeys.txt \
  --bucket pn-safestorage-eu-south-1-123456789 \
  --envName dev
```

### Opzioni Principali

```bash
node index.js \
  --inputFile filekeys.txt \
  --bucket pn-safestorage-eu-south-1-123456789 \
  --envName dev \
  --concurrency 200 \
  --batchSize 1000
```

### Resume Automatico

In caso di interruzione, rieseguire lo stesso comando per riprendere dall'ultimo checkpoint.
Massimo rivalidazione dopo crash: 1 batch (default: 1000 file).

```bash
node index.js \
  --inputFile filekeys.txt \
  --bucket pn-safestorage-eu-south-1-123456789 \
  --envName dev
```

## Parametri

| Parametro | Breve | Richiesto | Predefinito | Descrizione |
|-----------|-------|----------|---------|-------------|
| `--inputFile` | `-f` | Sì | - | File con le chiavi S3 (una per riga) |
| `--bucket` | `-b` | Sì | - | Nome bucket S3 |
| `--envName` | `-e` | No | - | Ambiente (dev\|uat\|test\|prod\|hotfix) |
| `--profile` | `-p` | No | confinfo | Account AWS (confinfo\|core) |
| `--concurrency` | `-c` | No | 100 | Richieste S3 concorrenti (1-1000) |
| `--batchSize` | `-s` | No | 1000 | Numero di chiavi per batch |
| `--startFromLine` | `-l` | No | 0 | Riga da cui iniziare |
| `--outputDir` | `-o` | No | ./results | Directory di output |
| `--dryRun` | `-r` | No | false | Simula senza validare |
| `--help` | `-h` | No | - | Mostra aiuto |

## Formato Input

File di testo con una chiave S3 per riga:

```text
PN_NOTIFICATION_ATTACHMENTS-abc123.pdf
PN_AAR-def456.pdf
safestorage://PN_LEGAL_FACTS-ghi789.pdf
```

Il prefisso `safestorage://` viene automaticamente rimosso.

## Output

### Risultati Validazione

Posizione: `results/{timestamp}/results.csv`

```csv
fileKey,valid,error
PN_NOTIFICATION_ATTACHMENTS-abc123.pdf,true,
PN_AAR-def456.pdf,false,InvalidMagicBytes
PN_LEGAL_FACTS-ghi789.pdf,false,NoSuchKey
```

### File Falliti (per Retry)

Posizione: `results/{timestamp}/failed.csv`

Contiene solo i file con errori, pronto per essere riprocessato:

```csv
fileKey,error
PN_AAR-def456.pdf,InvalidMagicBytes
PN_LEGAL_FACTS-ghi789.pdf,NoSuchKey
```

**Tipi di Errore:**

- `NoSuchKey`: File non esiste
- `AccessDenied`: Errore di permessi
- `InvalidRange`: File troppo piccolo
- `ThrottlingException`: Rate limiting S3
- `RequestTimeout`: Timeout di rete

### File Checkpoint

Posizione: `results/{timestamp}/checkpoint.json`

Contiene stato di avanzamento, contatori e timestamp per il resume automatico.

## Prestazioni

Con `concurrency=100`: ~2.000 file/secondo

### Tuning Concurrency

- Iniziare con 50-100
- Aumentare a 200-500 se nessun errore di throttling
- Massimo pratico: 1000

## Esempi

### Dev

```bash
node index.js \
  --inputFile filekeys.txt \
  --bucket pn-safestorage-eu-south-1-123456789 \
  --envName dev
```

### Opzioni aggiuntive

```bash
node index.js \
  --inputFile filekeys.txt \
  --bucket pn-safestorage-eu-south-1-123456789 \
  --envName prod \
  --concurrency 300
```

### Dry run

```bash
node index.js \
  --inputFile filekeys.txt \
  --bucket pn-safestorage-eu-south-1-123456789 \
  --envName dev \
  --dryRun
```

### Retry file falliti

Usa `failed.csv` come input per riprocessare solo i file con errori:

```bash
node index.js \
  --inputFile results/2025-01-23_14-30-45/failed.csv \
  --bucket pn-safestorage-eu-south-1-123456789 \
  --envName dev
```

## Troubleshooting

**ThrottlingException frequenti**: Ridurre `--concurrency`

**Consumo memoria elevato**: Ridurre `--batchSize`

**Resume da checkpoint**: Rieseguire lo stesso comando nella stessa directory
