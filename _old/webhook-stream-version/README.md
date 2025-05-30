# Utility di aggiornamento versioni per pn-WebhookStreams

Questo script permette di aggiornare gli elementi nella tabella DynamoDB pn-WebhookStreams aggiungendo l'attributo `version`.

## Prerequisiti

- Node.js >= 18.0.0 installato
- Configurazione AWS CLI con le credenziali appropriate
- File CSV contenente i dati degli stream da aggiornare

## Struttura del File CSV

Il file CSV deve contenere le seguenti colonne:
- `hashKey`: Chiave di partizione dell'elemento
- `sortKey`: Chiave di ordinamento dell'elemento
- `version`: Valore della versione da impostare

## Utilizzo

```bash
node index.js --envName|-e <ambiente> --csvFile|-f <percorso>
```

### Parametri

- `--envName`, `-e`: Ambiente di destinazione (dev|uat|test|prod|hotfix)
- `--csvFile`, `-f`: Percorso del file CSV contenente i dati degli stream
- `--help`, `-h`: Visualizza il messaggio di aiuto

### Esempi

```bash
# Aggiornamento degli stream in ambiente dev
node index.js -e dev -f ./streams.csv
```

## Output

Lo script produce un riepilogo dell'esecuzione con:
- Numero totale di elementi processati
- Numero di elementi aggiornati con successo
- Numero di elementi saltati (versione già presente)
- Numero di aggiornamenti falliti

## Note

- Lo script verifica l'esistenza dell'elemento prima dell'aggiornamento
- Gli elementi che già possiedono l'attributo `version` vengono saltati