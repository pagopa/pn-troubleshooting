# Redrive Event from DLQ to Kinesis Stream

Script di redrive di un evento da una DLQ ad uno Stream Kinesis

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo script esegue un operazione di redrive di un evento su uno stream kinesis a partire dalle informazioni inserite nel file `event.json`.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node put_dlq_event_to_kinesis.js --awsProfile <aws-profile> --arnStream <kinesis-stream-arn>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<kinesis-stream-arn>` é l'ARN dello stream kinesis sul quale si vuole pubblicare l'evento.
