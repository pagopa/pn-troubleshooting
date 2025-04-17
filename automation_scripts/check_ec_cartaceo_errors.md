# Script di pulizia DLQ Errori EC Cartaceo

Script Bash per la pulizia della `pn-ec-cartaceo-errori-queue-DLQ.fifo`.  
Lo script esegue le seguenti operazioni:
1. Effettua il dump dei messaggi dalla coda DLQ `pn-ec-cartaceo-errori-queue-DLQ.fifo`.
2. Estrae i valori `requestIdx` dal dump dei messaggi.
3. Controlla lo stato delle richieste sulla `pn-EcRichiesteMetadati` tramite il [check_status_request](https://github.com/pagopa/pn-troubleshooting/tree/main/check_status_request).
4. Filtra i messaggi in errore ed effettua la conversione del dump in formato JSONLine.
5. Copia i file generati in una cartella di output relativa allo script (`output/check_ec_cartaceo_errors`).
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
./check_ec_cartaceo_errors.sh -w <work-dir> [--visibility-timeout] [--purge]
```

Dove:
- `-w, --work-dir`: (Obbligatorio) Directory di lavoro contenente le sottocartelle necessarie (dump_sqs, check_status_request, remove_from_sqs).
- `--purge`: (Opzionale) Se specificato, rimuove i messaggi in errore dalla coda DLQ dopo il timeout di visibilità.
- `-h, --help`: Mostra il messaggio di aiuto.

## Struttura Output

I file generati vengono copiati nella cartella `output/check_ec_cartaceo_errors`, e includono:
- Il dump originale.
- Il file con tutti i valori `requestIdx`.
- Il file con gli ID delle richieste in errore.
- Il file in formato JSONLine ottenuto dal dump.
- Il file filtrato (a cui sono stati rimossi i messaggi in errore).

## Modalità Purge

Se attivata con `--purge`, lo script:
- Passa alla cartella `remove_from_sqs` all'interno della directory di lavoro.
- Attende il timeout di visibilità (predefinito 30 secondi).
- Invoca il [remove_from_sqs](https://github.com/pagopa/pn-troubleshooting/tree/main/remove_from_sqs) per rimuovere i messaggi dalla coda DLQ.