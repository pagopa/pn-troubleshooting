# Start e stop dei task ECS tramite Lambda AWS

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
node lambda_start_stop_env.js \
	--account_type <core|confinfo> \
	[--region region] \
	--action <Start|Stop> \
	--env <dev|test|uat|hotfix>
```

Dove:
- account_type: è il tipo di account AWS;
- action: è il tipo di account AWS. I suoi valori devono essere scritti con l'iniziale maiuscola;
- env: è l'ambiente target. 

