# Aggiornamento dei TTL nella tabella pn-Action

## Tabella dei Contenuti

- [Descrizione](#Descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script:
- prende in input un file CSV con due colonne, actionId e TTL (valori attuali);
- aggiorna il TTL nella tabella 'pn-Action' tramite chiamate batch parallele a [TransactWriteItems](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html), fino a 25 elementi per batch, con condizione di esistenza (`attribute_exists(actionId)`);
- elabora più batch in parallelo (concorrenza configurabile) per massimizzare la velocità, gestendo automaticamente i retry con backoff esponenziale in caso di errori transitori (es. throttling);
- fornisce una modalità `dryRun` per simulare l'esecuzione senza modificare DynamoDB;
- logga solo gli elementi falliti, in modo efficiente e batch, nei file di output;
- permette di riprendere l'elaborazione da uno specifico actionId in caso di interruzione.

NB: Gli actionId che generano un'eccezione "ConditionalCheckFailed" (elemento non presente) vengono loggati come scartati ma non interrompono l'esecuzione. Errori diversi vengono gestiti con retry automatici; se persistono dopo i tentativi configurati, vengono loggati come falliti.


## Installazione

```bash
npm install
```

## Utilizzo

```bash
node index.js \
 --days <num> \
 --fileName <csv file> \
 [--env <dev|test|uat|hotfix>] \
 [--startActionId <value>] \
 [--batchSize <num>] \
 [--concurrency <num>] \
 [--maxRetries <num>] \
 [--dryRun]
```

Dove:

- env: ambiente target (opzionale);
- days: numero di giorni da aggiungere all'attuale TTL;
- fileName: file CSV con colonne actionId e ttl;
- startActionId: actionId di partenza (opzionale, per ripresa);
- batchSize: dimensione batch DynamoDB (default/max: 25);
- concurrency: numero di batch processati in parallelo (default: 8);
- maxRetries: tentativi massimi per batch falliti (default: 5);
- dryRun: se presente, simula l'esecuzione senza modificare DynamoDB.

### Output

- `failures.json`: elenco dettagliato degli actionId falliti e relativi errori;
- `failures.csv`: elenco sintetico degli actionId falliti.

I file vengono scritti in:

- `/results/YYYY-MM-DD_HH-mm-ss/env/` oppure `/results/YYYY-MM-DD_HH-mm-ss/` a seconda dell'ambiente.

### Ripresa

Per riprendere da un punto specifico, utilizzare il parametro `--startActionId` con l'actionId fornito nel riepilogo finale.

---
