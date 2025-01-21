# Cost Saving scritps

Set di script utili per il cost saving di AWS

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

1) lo script CodebuildCheckCompute.sh da informazioni sulle risorse compute utilizzati da tutti i codebuild di un account aws di PN
2) lo script ExtractDesireEcsCounts.sh generare il file json con il desire_count degli ecs e fa l' upload sul bucket s3 che lambda di start/stop del servizio ecs utilizza quotidianamente

## Installazione

1) jq installato sul propro client

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-confinfo-<env>
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
 ./CodebuildCheckCompute.sh  -p <aws-profile> -r region --queueName <queue-name> 
 ./ExtractDesireEcsCounts.sh  -p <aws-profile> -r region --queueName <queue-name> 
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS;
- `<region>` region AWS;