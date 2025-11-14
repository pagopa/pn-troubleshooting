# Script di gestione DLQ ExternalChannel to PaperChannel

Script Bash per la gestione delle code DLQ `pn-external_channel_to_paper_channel-DLQ` e `pn-external_channel_to_paper_channel_dry_run-DLQ`.  
Lo script esegue le seguenti operazioni:

1. Effettua il dump dei messaggi dalla coda DLQ specificata (predefinita: `pn-external_channel_to_paper_channel-DLQ`).
2. Converte il dump in formato JSONLine ed estrae i valori `requestId`.
3. Estrae le richieste per le quali è stato ricevuto *feedback* e quelle per cui non è stato ricevuto mediante il [check_feedback_from_requestId_simplified](https://github.com/pagopa/pn-troubleshooting/tree/main/check_feedback_from_requestId_simplified).
4. Filtra gli eventi di richieste che non hanno ricevuto *feedback* dal dump originale lasciando solo gli eventi di richieste che lo hanno ricevuto, i quali possono essere rimossi dalla DLQ.
5. (Opzionale) Se attivato il parametro `--purge`, rimuove i messaggi elaborati dalla coda DLQ mediante il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs).
6. Copia i file generati in una cartella di output relativa allo script (`output/check_ec_to_pc`).

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
./check_ec_to_pc.sh -w <work-dir> [-e <env>] [-t <visibility-timeout>] [-q <queue-name>] [--purge]
```

Dove:

- `-w, --work-dir`: (Obbligatorio) Directory di lavoro contenente le sottocartelle necessarie (dump_sqs, check_feedback_from_requestId_simplified, remove_from_sqs).
- `-e, --env`: (Opzionale) Ambiente destinazione (prod, test, uat, hotfix), il predefinito è prod.
- `-t, --visibility-timeout`: (Opzionale) Timeout di visibilità dei messaggi sulla coda DLQ per gli script di dump e rimozione (predefinito: 300 secondi).
- `-q, --queue`: (Opzionale) Nome della coda SQS da elaborare (predefinito: `pn-external_channel_to_paper_channel-DLQ`).
- `--purge`: (Opzionale) Se specificato, rimuove i messaggi in errore dalla coda DLQ dopo il timeout di visibilità.
- `-h, --help`: Mostra il messaggio di aiuto.

### Esempi

Elaborare la coda standard:

```bash
./check_ec_to_pc.sh -w /path/to/work-dir
```

Elaborare la coda dry_run:

```bash
./check_ec_to_pc.sh -w /path/to/work-dir -q pn-external_channel_to_paper_channel_dry_run-DLQ
```

Elaborare con purge:

```bash
./check_ec_to_pc.sh -w /path/to/work-dir -q pn-external_channel_to_paper_channel_dry_run-DLQ --purge
```

## Struttura Output

I file generati vengono copiati nella cartella `output/check_ec_to_pc`, e includono:

- Il dump originale.
- Il file con tutti i valori `requestId`.
- Il file con gli ID delle richieste che non hanno ricevuto *feedback*.
- Il file in formato JSONLine ottenuto dal dump.
- Il file filtrato (da cui sono stati rimossi gli eventi di richieste senza *feedback*).

## Modalità Purge

Se eseguito con opzione `--purge`, lo script esegue le seguenti azioni aggiuntive:

- Passa alla cartella `remove_from_sqs` all'interno della directory di lavoro.
- Attende il timeout di visibilità (predefinito 300 secondi).
- Invoca il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs) per rimuovere i messaggi dalla coda DLQ specificata.
