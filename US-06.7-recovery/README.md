# US-06.7-recovery

Script che segue le direttive riportate nell'SRS https://pagopa.atlassian.net/wiki/spaces/PN/pages/941228579/SRS+miglioramento+performance+delivery-push#US-06.9---Procedure-di-ripristino-in-caso-di-errori-definiti-in-US-06.7.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Script che segue le direttive riportate nell'SRS https://pagopa.atlassian.net/wiki/spaces/PN/pages/941228579/SRS+miglioramento+performance+delivery-push#US-06.9---Procedure-di-ripristino-in-caso-di-errori-definiti-in-US-06.7.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node index.js --envName <envName> [--visibilityTimeout <visibilityTimeout>] [--fileName <fileName> [--timestamp <timestamp>]] [--window] [kinesis [--dlq <dlq>]]
```
Dove:
- `<env-name>` l'ambiente su cui verrà eseguito lo script;
- `<visibility-timeout>` indica per quanto tempo un messaggio non deve essere visibile in coda una volta acquisito;
- `<file-name>` indica il nome del file che contiene le action id;
- `<timestamp>` indica quando iniziare a ricercare nei log; (UTC)
- `<window>` indica la finestra temporale di ogni ricerca nei log;
- `<kinesis>` indica se abilitare la ricerca per kinesis;
- `<dlq>` indica la dlq kinesis sul quale intervenire ('pn-delivery_push_action_router_DLQ' | 'pn-delivery_push_action_enqueuer_DLQ' );

esempio di esecuzione per file
node index.js --envName dev --fileName actionIds.txt --timestamp 1720682511

esempio di esecuzione da DLQ kinesis
node index.js --envName dev --visibilityTimeout 30 --kinesis --dlq pn-delivery_push_action_router_DLQ

esempio di esecuzione da DLQ
node index.js --envName dev --visibilityTimeout 30