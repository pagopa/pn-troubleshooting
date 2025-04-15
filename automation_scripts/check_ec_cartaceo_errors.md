# Script di Troubleshooting Errori EC Cartaceo

Script Bash per la pulizia della `pn-ec-cartaceo-errori-queue-DLQ.fifo`.  
Lo script esegue le seguenti operazioni:
1. Effettua il dump dei messaggi dalla coda DLQ `pn-ec-cartaceo-errori-queue-DLQ.fifo`.
2. Estrae i valori `requestIdx` dal dump dei messaggi.
3. Controlla lo stato delle richieste tramite il servizio pn-EcRichiesteMetadati.
4. Filtra i messaggi in errore e genera file in formato JSONLine.
5. Copia i file generati in una cartella di output.
6. (Opzionale) Se attivato il parametro `--purge`, rimuove i messaggi elaborati dalla coda DLQ.

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
./check_ec_cartaceo_errors.sh -w <work-dir> [-o <output-dir>] [--purge]
```

Dove:
- `-w, --work-dir`: (Obbligatorio) Directory di lavoro contenente i sottocartelle necessarie (dump_sqs, check_status_request, remove_from_sqs).
- `-o, --output-dir`: (Opzionale) Directory dove copiare i file generati (default: ./output nella directory di partenza).
- `--purge`: (Opzionale) Se specificato, rimuove i messaggi in errore dalla coda DLQ dopo una pausa di 30 secondi.
- `-h, --help`: Mostra il messaggio di aiuto.

### Esempio

```bash
./check_ec_cartaceo_errors.sh -w /path/to/work_dir -o /path/to/output_dir --purge
```

## Struttura Output

I file generati dallo script vengono copiati nella directory specificata da `--output-dir`. I file includono:
- Il file dump originale.
- Il file contenente tutti i valori `requestIdx`.
- Il file contenente gli ID delle richieste in errore.
- Il file in formato JSONLine ottenuto dal dump originale.
- Il file filtrato in cui sono esclusi i messaggi in errore.

## Modalità Purge

Se attivata con `--purge`, lo script:
- Passa alla cartella `remove_from_sqs` all'interno della directory di lavoro.
- Attende 30 secondi per il timeout di visibilità.
- Esegue lo script Node.js per rimuovere i messaggi dalla coda DLQ `pn-ec-cartaceo-errori-queue-DLQ.fifo`.

Il comando eseguito in modalità purge è:
```bash
node index.js --account confinfo --envName prod --queueName pn-ec-cartaceo-errori-queue-DLQ.fifo --visibilityTimeout 30 --fileName <filtered_dump>
```