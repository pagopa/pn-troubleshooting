# Script di gestione DLQ ExternalChannel to PaperChannel

Script Bash per la gestione della `pn-external_channel_to_paper_channel-DLQ`.  
Lo script esegue le seguenti operazioni:
1. Effettua il dump dei messaggi dalla coda DLQ `pn-external_channel_to_paper_channel-DLQ`.
2. Converte il dump in formato JSONLine ed estrae i valori `requestId`.
3. Estrae le richieste per le quali è stato ricevuto *feedback* e quelle per cui non è stato ricevuto mediante il [check_feedback_from_requestId_simplified](https://github.com/pagopa/pn-troubleshooting/tree/main/check_feedback_from_requestId_simplified).
4. Filtra gli eventi di richieste che non hanno ricevuto *feedback* dal dump originale lasciando solo gli eventi di richieste che lo hanno ricevuto, i quali possono essere rimossi dalla DLQ.
5. Copia i file generati in una cartella di output relativa allo script (`output/check_ec_to_pc`).
6. (Opzionale) Se attivato il parametro `--purge`, rimuove i messaggi elaborati dalla coda DLQ mediante il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs).


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
./check_ec_to_pc.sh -w <work-dir> [--visibility-timeout] [--purge]
```

Dove:
- `-w, --work-dir`: (Obbligatorio) Directory di lavoro contenente le sottocartelle necessarie (dump_sqs, check_feedback_from_requestId_simplified, remove_from_sqs).
- `-t, --visibility-timeout`: (Opzionale) Timeout di visibilità dei messaggi sulla coda DLQ per gli script di dump e rimozione.
- `--purge`: (Opzionale) Se specificato, rimuove i messaggi in errore dalla coda DLQ dopo il timeout di visibilità.
- `-h, --help`: Mostra il messaggio di aiuto.

## Struttura Output

I file generati vengono copiati nella cartella `output/check_ec_to_pc`, e includono:
- Il dump originale.
- Il file con tutti i valori `requestId`.
- Il file con gli ID delle richieste che non hanno ricevuto *feedback*.
- Il file in formato JSONLine ottenuto dal dump.
- Il file filtrato (da cui sono stati rimossi gli eventi di richieste senza *feedback*).

## Modalità Purge

Se eseguito con opzione `--purge`, lo script:
- Passa alla cartella `remove_from_sqs` all'interno della directory di lavoro.
- Attende il timeout di visibilità (predefinito 180 secondi).
- Invoca il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs) per rimuovere i messaggi dalla coda DLQ.