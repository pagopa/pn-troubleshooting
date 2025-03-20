# Utility di Aggiornamento Costi Notifiche Analogiche

Questo script permette di aggiornare i costi delle notifiche analogiche attraverso chiamate API e messaggi SQS a seconda dello stato della notifica.

## Prerequisiti

- Node.js >= 18.0.0
- AWS CLI configurato con profilo SSO appropriato
- File CSV contenente i dati delle notifiche da aggiornare

## Struttura del File CSV

Il file CSV deve contenere le seguenti colonne:
- `IUN`
- `timelineElementId`
- `category`
- `costo timelineElementId`
- `vat`
- `recipientIndex`
- `noticeCode`
- `creditorTaxId`
- `eventTimestamp`
- `notificationFeePolicy`
- `paFee`

## Utilizzo

```bash
node index.js -e test -f ./notifiche.csv

node index.js --envName test --csvFile ./notifiche.csv
```

### Parametri

- `--envName`, `-e`: Ambiente di destinazione (uat|test|prod|hotfix)
- `--csvFile`, `-f`: Percorso del file CSV
- `--help`, `-h`: Visualizza il messaggio di aiuto

## Note

- Lo script utilizza AWS SSM per il port forwarding
- Le notifiche vengono processate in base allo stato della notifica analogica:
  - Chiamata POST all'API `/ext-registry-private/cost-update` di External Registries per: VALIDATION, REQUEST_REFUSED, NOTIFICATION_CANCELLED
  - Invio evento su coda SQS `pn-deliverypush_to_externalregistries` per: SEND_ANALOG_DOMICILE_ATTEMPT_0, SEND_ANALOG_DOMICILE_ATTEMPT_1, SEND_SIMPLE_REGISTERED_LETTER