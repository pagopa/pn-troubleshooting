# Get Paper delivery information

Script di recupero informazioni di un requestId.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione
Lo Script, dato in input un requestId, raccoglie i dati dalle seguenti tabelle Dynamo:
1) pn-PaperRequestError
2) pn-PaperRequestDelivery
3) pn-PaperAddress
4) pn-EcRichieste
5) pn-PaperEvents
6) pn-EcRichiesteMetadati
   
Dopodiché analizza decodifica i dati e li restituisce in formato JSON.
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
node index.js --awsCoreProfile <aws-core-profile> --awsConfinfoProfile <aws-confinfo-profile> --requestId <request-id>
```
Dove:
- `<aws-profile-dev>` è il profilo dell'account AWS dev;
- `<aws-profile-conf>` è il profilo dell'account AWS confinfo;
- `<request-id>` è il request id del messaggio desiderato;
- `<format>` è il formato dell'output, può essere "raw" o "compact"



