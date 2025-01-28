# Elenco dei service ECS e dello stato associato ai loro task

## Tabella dei Contenuti

- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

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

1. Ottenere l'elenco dei cluster ECS associati ad un profilo AWS:
```bash
node index.js \
	--account_type <core|confinfo> \
	[--region region] \
	--cluster=? \
	--env <dev|test|uat|hotfix>
```

2. Ottenere l'elenco dei nomi dei servizi, numero di task running attesi, numero di task running
```bash
# Esecuzione script
node index.js \
	--account_type <core|confinfo> \
	[--region region] \
	--cluster <nome cluster> \
	--env <dev|test|uat|hotfix>
```

Dove:
- account_type: è il tipo di account AWS;
- region: è la regione AWS. Il valore di default è "eu-south-1";
- cluster: è il nome del cluster ECS. E' possibile ottenere l'elenco dei cluster disponibili assegnando all'argomento il valore "?";
- env: è l'ambiente target. 

