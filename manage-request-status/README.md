# Utility di gestione delle richieste su pn-EcRichiesteMetadati

Questo script permette di gestire gli elementi nella tabella DynamoDB pn-EcRichiesteMetadati, consentendo di visualizzare e modificare lo stato delle richieste.

## Prerequisiti

- Node.js >= 18.0.0 installato
- Configurazione AWS CLI con le credenziali appropriate
- File TXT o CSV (a seconda del comando) contenente gli ID delle richieste

## Comandi Disponibili

### save_request_status

Legge gli ID delle richieste da un file TXT e salva lo stato corrente in un file CSV.

```bash
node index.js save_request_status -i requestIds.txt [-e ambiente]
```

Il comando genera un file `saved.csv` nella cartella `results/` con due colonne:
- `requestId`: ID della richiesta
- `statusRequest`: Stato attuale della richiesta

### set_request_status

Aggiorna lo stato delle richieste specificate in un file TXT con un nuovo stato.

```bash
node index.js set_request_status -i requestIds.txt -s NUOVO_STATO [-e ambiente]
```

### restore_request_status

Ripristina lo stato delle richieste utilizzando i dati da un file CSV di backup (come quello generato da `save_request_status`).

```bash
node index.js restore_request_status -i saved.csv [-e ambiente]
```

## Parametri Comuni

- `--inputFile`, `-i`: Percorso del file di input (TXT o CSV)
- `--envName`, `-e`: Ambiente AWS di destinazione (opzionale)
- `--status`, `-s`: Nuovo stato da impostare (richiesto solo per `set_request_status`)
- `--help`, `-h`: Visualizza il messaggio di aiuto

## Output

Tutti i comandi che modificano i dati producono un riepilogo dell'esecuzione con:
- Numero totale di elementi processati
- Numero di elementi aggiornati con successo
- Numero di aggiornamenti falliti

## Note

- Il comando `save_request_status` è utile per fare backup dello stato corrente
- Il comando `set_request_status` permette di aggiornare lo stato di più richieste contemporaneamente
- Il comando `restore_request_status` consente di ripristinare stati precedentemente salvati
- Ogni modifica aggiorna automaticamente il timestamp dell'ultima modifica