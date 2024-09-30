# Script Temporaneo di estrazione dati settimanali

Script temporaneo di estrazione dati settimanali, lo script esegue automaticamente i Tunnel SSM e li chiude in completa autonomia ed eseguento il RunAll.sh vengono eseguiti 3 script.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Requisiti](#requisiti)
- [Utilizzo](#utilizzo)

## Descrizione

Lo Script, dato in intput il profilo AWS e il nome del secret di Opensearch
1) Query su Opensearch
2) Query su Spark mediante un client hive
3) Scan su DynamoDB

Il RunAll.sh esegue i 3 script che possono essere anche avviati singolarmente a seconda dell'esigenza. Lo script per Spark e' modulare, le query possono essere messe nel file queries.sql. 

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

