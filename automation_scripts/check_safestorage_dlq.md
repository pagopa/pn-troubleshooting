# Script di pulizia DLQ SafeStorage

Script Bash per la pulizia delle DLQ di SafeStorage:

- `pn-ss-transformation-raster-queue-DLQ`
- `pn-ss-main-bucket-events-queue-DLQ`
- `pn-ss-staging-bucket-events-queue-DLQ`
- `pn-ss-transformation-sign-and-timemark-queue-DLQ`
- `pn-safestore_to_deliverypush-DLQ`
  
Lo script esegue le seguenti operazioni:

1. Effettua il dump dei messaggi dalla coda DLQ.
2. A seconda della DLQ da pulire:
    - `pn-ss-transformation-raster-queue-DLQ`: verifica se esiste un evento `sent` relativo agli allegati cartacei ([check-sent-paper-attachment](https://github.com/pagopa/pn-troubleshooting/tree/main/check-sent-paper-attachment)).
    - `pn-safestore_to_deliverypush-DLQ`: verifica che la `fileKey` non sia presente sulla tabella `pn-DocumentCreationRequestTable` ([analyze-safestorage-dlq](https://github.com/pagopa/pn-troubleshooting/tree/main/analyze-safestorage-dlq)).
    - `pn-ss-staging-bucket-events-queue-DLQ` e `pn-ss-transformation-sign-and-timemark-queue-DLQ`: verifica la presenza della `fileKey` nel solo bucket principale di SS e che lo stato del documento sulla tabella `pn-SsDocumenti`, in base al suo prefisso, sia quello atteso ([analyze-safestorage-dlq](https://github.com/pagopa/pn-troubleshooting/tree/main/analyze-safestorage-dlq)).
    - `pn-ss-main-bucket-events-queue-DLQ`: stesse verifiche della `pn-ss-staging-bucket-events-queue-DLQ`, ma con il controllo aggiuntivo su documenti di tipo `PN_AAR` e `PN_LEGAL_FACTS` per accertare che la richiesta della loro creazione non sia l'ultimo evento in timeline ([analyze-safestorage-dlq](https://github.com/pagopa/pn-troubleshooting/tree/main/analyze-safestorage-dlq)).
3. Copia il dump originale ed il file di analisi, contenente gli eventi rimuovibili dalla DLQ, nella cartella di output (`output/check_safestorage_dlq`).
4. In tutti i casi stampa un conteggio degli eventi totali, rimuovibili e non.
5. (Opzionale) Se attivato il parametro `--purge`, rimuove i messaggi elaborati dalla coda DLQ mediante il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs).

## Prerequisiti

- jq
- Node.js (>= v16.0.0)
- AWS CLI configurato con SSO

## Utilizzo

### Autenticazione AWS

Accedi ad AWS tramite SSO, ad esempio:

```bash
aws sso login --profile sso_pn-confinfo-prod
```

### Esecuzione Script

Esecuzione su tutte le DLQ supportate:

```bash
./check_safestorage_dlq.sh -w <work-dir> -q all [--visibility-timeout] [--purge]
```

oppure per singola DLQ:

```bash
./check_safestorage_dlq.sh -w <work-dir> -q <queue> [--visibility-timeout] [--purge]
```

Dove:

- `-w, --work-dir`: (Obbligatorio) Directory di lavoro contenente le sottocartelle necessarie (dump_sqs, check-sent-paper-attachment, remove_from_sqs).
- `-q, --queue`: (Obbligatorio) Coda DLQ di SS oggetto di analisi e pulizia.
- `-t, --visibility-timeout`: (Opzionale) Timeout di visibilità dei messaggi sulla coda DLQ per gli script di dump e rimozione.
- `--purge`: (Opzionale) Se specificato, rimuove i messaggi elaborati dalla coda DLQ dopo il timeout di visibilità.
- `-h, --help`: Mostra il messaggio di aiuto.

## Struttura Output

I file generati vengono copiati nella cartella `output/check_safestorage_dlq` e includono:

- Il dump originale dei messaggi.
- Il file di analisi che contiene gli eventi da rimuovere.

## Modalità Purge

Se eseguito con opzione `--purge`, lo script:

- Passa alla cartella `remove_from_sqs` all'interno della directory di lavoro.
- Attende il timeout di visibilità (predefinito 30 secondi).
- Invoca il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs) per rimuovere i messaggi dalla coda DLQ.
