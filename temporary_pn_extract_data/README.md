# Dump SQS messages

Script temporaneo di estrazione dati settimanali

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Requisiti](#requisiti)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in intput il profilo AWS e il nome del secret di Opensearch
1) Query su Opensearch
2) Query su Spark mediante un client hive
3) Scan su DynamoDB

## Requisit

```bash
docker 
docker compose
jq
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
./RunAll.sh -p <aws-profile> -s <nome-secret-opensearch>
```
Dove:
- `<aws-profile>` è il profilo dell'account AWS.
- `<nome-secret-opensearch>` è il nome del secret di opensearch.

