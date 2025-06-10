# redrive_pnPaperError

Script di sottomissione eventi da un file della tabella pn-paperErrorRequest
## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in input un file esegue la risottomissione seguendo o il flusso postal o il flusso registro:
- il flusso registro recupera le informazioni dai registri nazionali e li risottomette tramite API (necessario l'accesso al bastion host)
- il flusso postal ricrea le informazioni sottomettendole nella coda di riferimento.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare 

```bash
aws sso login --profile <core-profile>
aws sso login --profile <confinfo-profile>
```


Avviare tunneling SSM tramite una EC2 dell'account AWS Core e dell'account AWS Confinfo verso gli ALB (fare riferimento alla [guida](https://pagopa.atlassian.net/wiki/spaces/PN/pages/706183466/Bastion+Host+SSM))

Aggiornare o creare il file .env con il valore ALB_BASE_URL e ALB_CONFIDENTIAL_URL in base alla porta locale impostata, ad es. 
ALB_BASE_URL=http://localhost:8080
ALB_CONFIDENTIAL_URL=http://localhost:8081

### Esecuzione
```bash
node index.js --envName <envName> --fileName <fileName>
```
Dove:
- `<envName>` è l'environment sul quale si intende effettuare la risottomissione; (prod e uat)
- `<fileName>` è il path del file che contiene i requestId.
- `<firstAttempt>` indica se nel file ci sono primi tentativi.