# EventBridge Rule Manager

Script per la gestione delle regole EventBridge in AWS.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
* [Esempi](#esempi)

## Descrizione

Lo script permette di:
- Elencare tutte le regole EventBridge in un account/ambiente
- Cercare regole per nome
- Abilitare/disabilitare regole specifiche

## Prerequisiti

- Node.js >= 18.0.0
- Accesso AWS SSO configurato per gli account target

## Installazione

```bash
npm install
```

## Utilizzo

### Preparazione

```bash
aws sso login --profile sso_pn-core-<env>
aws sso login --profile sso_pn-confinfo-<env>
```

### Parametri

- `--list, -l`: Opzionale. Elenca tutte le regole
- `--search, -s`: Opzionale. Cerca regole per nome
- `--envName, -e`: Obbligatorio. Ambiente target (dev|test)
- `--account, -a`: Obbligatorio. Account AWS (core|confinfo)
- `--ruleName, -r`: Obbligatorio per enable/disable. Nome della regola
- `--enable, -n`: Abilita la regola specificata
- `--disable, -d`: Disabilita la regola specificata
- `--help, -h`: Mostra il messaggio di aiuto

## Esempi

Lista tutte le regole:
```bash
node eventbridge-manage-rules.js --list --envName dev --account core
```

Cerca regole:
```bash
node eventbridge-manage-rules.js --search "lambda" --envName dev --account core
```

Abilita una regola:
```bash
node eventbridge-manage-rules.js --envName dev --account core --ruleName myRule --enable
```

Disabilita una regola:
```bash
node eventbridge-manage-rules.js --envName dev --account core --ruleName myRule --disable
```

## Troubleshooting

In caso di errori di autenticazione SSO:
1. Eseguire `aws sso logout`
2. Eseguire `aws sso login --profile sso_pn-<account>-<env>`

Dove:
- `<account>` può essere `core` o `confinfo`
- `<env>` può essere `dev` o `test`
