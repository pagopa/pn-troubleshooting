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

```bash

node index.js \
	--account_type <core|confinfo> \
	[--region region] \
	--env <dev|test|uat|hotfix>
```

Dove:
- account_type: è il tipo di account AWS;
- region: è la regione AWS. Il valore di default è "eu-south-1";
- env: è l'ambiente target. 

