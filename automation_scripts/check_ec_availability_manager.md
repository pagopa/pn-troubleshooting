# Script di pulizia DLQ Gestore Disponibilità EC

Script Bash per la pulizia della `pn-ec-availabilitymanager-queue-DLQ`.  
Lo script esegue le seguenti operazioni:
1. Effettua il dump dei messaggi dalla coda DLQ `pn-ec-availabilitymanager-queue-DLQ`.
2. Verifica se esiste un evento `sent` relativo agli allegati cartacei usando il [check-sent-paper-attachment](https://github.com/pagopa/pn-troubleshooting/tree/main/check-sent-paper-attachment).
3. Copia il dump originale ed il file di analisi generato nella cartella di output (`output/check_ec_availability_manager`).
4. (Opzionale) Se attivato il parametro `--purge`, rimuove i messaggi elaborati dalla coda DLQ mediante il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs).

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

```bash
./check_ec_availability_manager.sh -w <work-dir> [--visibility-timeout] [--purge]
```

Dove:
- `-w, --work-dir`: (Obbligatorio) Directory di lavoro contenente le sottocartelle necessarie (dump_sqs, check-sent-paper-attachment, remove_from_sqs).
- `--purge`: (Opzionale) Se specificato, rimuove i messaggi elaborati dalla coda DLQ dopo il timeout di visibilità.
- `-h, --help`: Mostra il messaggio di aiuto.

## Struttura Output

I file generati vengono copiati nella cartella `output/check_ec_availability_manager` e includono:
- Il dump originale dei messaggi.
- Il file di analisi che contiene gli eventi da rimuovere (relativi al controllo dell'evento "sent").

## Modalità Purge

Se attivata con `--purge`, lo script:
- Passa alla cartella `remove_from_sqs` all'interno della directory di lavoro.
- Attende il timeout di visibilità (predefinito 30 secondi).
- Invoca il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs) per rimuovere i messaggi dalla coda DLQ.