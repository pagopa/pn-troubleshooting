# Strumento di Gestione Stato Richieste

Utility per la gestione degli stati delle richieste in DynamoDB, che permette di salvare, impostare e ripristinare gli stati di multiple richieste.

## Prerequisiti

- Node.js >= 18.0.0
- Credenziali AWS configurate
- Accesso alla tabella DynamoDB `pn-EcRichiesteMetadati`

## Installazione

```bash
npm install
```

## Utilizzo

Lo script supporta tre operazioni principali:

### 1. Salvataggio Stato Richieste

Salva lo stato corrente delle richieste in un file CSV:

```bash
node index.js -i input.txt -c save_request_status [-e environment]
```

- `input.txt`: File di testo contenente un requestId per riga
- L'output verrà salvato in `results/saved.csv`

### 2. Impostazione Stato Richieste

Aggiorna lo stato di multiple richieste:

```bash
node index.js -i input.txt -c set_request_status -s NUOVO_STATO [-e environment]
```

- `input.txt`: File di testo contenente un requestId per riga
- `NUOVO_STATO`: Il valore dello stato da impostare per tutte le richieste

### 3. Ripristino Stato Richieste

Ripristina gli stati da un file CSV precedentemente salvato:

```bash
node index.js -i input.csv -c restore_request_status [-e environment]
```

- `input.csv`: File CSV con colonne `requestId` e `statusRequest`

### Parametri Comuni

- `-i, --inputFile`: Percorso del file di input (obbligatorio)
- `-c, --command`: Comando da eseguire (obbligatorio)
- `-e, --envName`: Nome dell'ambiente (opzionale: dev|uat|test|prod|hotfix)
- `-s, --status`: Nuovo valore dello stato (obbligatorio per set_request_status)
- `-h, --help`: Visualizza il messaggio di aiuto

### Esempi

```bash
# Salva lo stato corrente
node index.js -i requestIds.txt -c save_request_status -e dev

# Imposta lo stato su ACCEPTED
node index.js -i requestIds.txt -c set_request_status -s ACCEPTED -e dev

# Ripristina lo stato dal CSV
node index.js -i saved.csv -c restore_request_status -e dev
```

## Output

Tutte le operazioni generano un file CSV nella directory `results` contenente:
- requestId
- statusRequest (corrente o aggiornato)

## Gestione Errori

- Le richieste non valide vengono registrate ma non bloccano il processo
- I risultati vengono salvati anche se alcune richieste falliscono
- I messaggi di errore dettagliati vengono visualizzati nella console
