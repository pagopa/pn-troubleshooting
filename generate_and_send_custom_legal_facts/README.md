# Generate and send custom legal facts

Script Node.js che:
- legge un file CSV con i dati delle attestazioni;
- genera il PDF del legal fact tramite Template Engine;
- carica il documento su Safe Storage tramite URL presigned.

## Indice

- [Descrizione](#descrizione)
- [Prerequisiti](#prerequisiti)
- [Installazione](#installazione)
- [Configurazione](#configurazione)
- [Utilizzo](#utilizzo)
- [Output](#output)

## Descrizione

Lo script principale è `index.js`.

Per ogni riga del CSV:
1. prepara il payload del documento;
2. invoca Template Engine per ottenere il PDF;
3. calcola checksum SHA-256 del file;
4. richiede URL presigned a Safe Storage;
5. carica il file su Safe Storage.

È disponibile anche la modalità `--mock` per usare payload/endpoint di test.

## Prerequisiti

- Node.js >= 18
- Accesso ai servizi PN (Template Engine e Safe Storage)
- File CSV di input con separatore `;`

## Installazione

```bash
npm install
```

## Configurazione

Creare/aggiornare il file `.env` partendo da `.env.example`.

Variabili usate dallo script:
- `ALB_TEMPLATE_ENGINE_BASE_URL`
- `ALB_SAFESTORAGE_BASE_URL`
- `SAFESTORAGE_CLIENT_API_KEY`

## Utilizzo

```bash
node index.js --fileName <file.csv> --cxId <cx-id> [--mock] [--contentType <type>] [--documentType <type>] [--status <status>]
```

Parametri:
- `--fileName`, `-t`: obbligatorio, path del file CSV da elaborare
- `--cxId`, `-i`: obbligatorio, valore header `x-pagopa-safestorage-cx-id`
- `--mock`, `-m`: opzionale, abilita modalità mock
- `--contentType`, `-c`: opzionale (non mock), content type da inviare a Safe Storage
- `--documentType`, `-d`: opzionale (non mock), document type da inviare a Safe Storage
- `--status`, `-s`: opzionale (non mock), status da inviare a Safe Storage

Esempio:

```bash
node index.js --fileName ./20260414_SSDA-812_Estrazione_dati_attestazioni.csv --cxId pn-delivery
```

Esempio in mock:

```bash
node index.js --fileName ./20260414_SSDA-812_Estrazione_dati_attestazioni.csv --cxId pn-delivery --mock
```

## Output

Lo script crea la cartella `generated_documents/` e salva:
- `legal_fact_<iun>.pdf` per ogni riga elaborata con successo
- `result.json` con l’ultimo `{ iun, key }` caricato su Safe Storage

In caso di errori su alcune righe, i dettagli vengono stampati a console a fine esecuzione.
