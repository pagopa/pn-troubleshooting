# Put_Event_to_SQS

Script di sottomissione eventi da un file in una coda SQS
## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input un file e una QueueURL, effettua la sottomissione degli eventi contenuti nel file.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile <profile>
```

### Esecuzione
```bash
node index.js --profile <profile> --queueUrl <queueUrl> --fileName <fileName>
```
Dove:
- `<profile>` è il profilo dell'account AWS;
- `<queueUrl>` é l'URL della coda in cui si vogliono sottomettere gli eventi.
- `<fileName>` è il path del file che contiene gli eventi.