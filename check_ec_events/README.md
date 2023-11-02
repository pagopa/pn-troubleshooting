# Check EC events

Script che verifica gli eventi duplicati e li suddivide in quelli da analizzare e quelli da reimmettere.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo script preso in input un file verifica che gli eventi contenuti al suo interno sono duplicati attraverso query e controlli sulla tabella DynamoDB EcRichiesteMetadati

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile  <aws-profile>
```

### Esecuzione
```bash
node index.js --awsProfile <aws-profile> --fileName <file-name> 
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<file-name>` è il nome della coda SQS;
