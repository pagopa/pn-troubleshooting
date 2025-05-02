# Script di pulizia DLQ EC Tracker

Script Bash per la pulizia di falsi negativi dalle DLQ di errore del Tracker di External Channel:

- `pn-ec-tracker-sms-errori-queue-DLQ.fifo`
- `pn-ec-tracker-pec-errori-queue-DLQ.fifo`
- `pn-ec-tracker-email-errori-queue-DLQ.fifo`
- `pn-ec-tracker-cartaceo-errori-queue-DLQ.fifo`
  
Lo script esegue le seguenti operazioni:

1. Effettua il dump dei messaggi dalla coda DLQ.
2. Analizza gli eventi nel dump e individua gli eventi rimuovibili mediante il [false_negative_ec_tracker](https://github.com/pagopa/pn-troubleshooting/tree/main/false_negative_ec_tracker).
3. Copia il dump originale ed il file di analisi, contenente gli eventi rimuovibili dalla DLQ, nella cartella di output (`output/check_ec_tracker_errors`).
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
./check_ec_tracker_errors.sh -w <work-dir> -q all [--visibility-timeout] [--purge]
```

oppure per singola DLQ:

```bash
./check_ec_tracker_errors.sh -w <work-dir> -q <queue> [--visibility-timeout] [--purge]
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
