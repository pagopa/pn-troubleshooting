# EventBridge Rule Manager

Script per la gestione delle regole EventBridge in AWS.

## Tabella dei Contenuti

* [Descrizione](#descrizione)
* [Prerequisiti](#prerequisiti)
* [Installazione](#installazione)
* [Utilizzo](#utilizzo)
  * [Preparazione](#preparazione)
  * [Parametri](#parametri)
* [Esempi](#esempi)
* [Script ECS Auto-Stop](#script-ecs-auto-stop)
  * [Parametri Auto-Stop](#parametri-auto-stop)
  * [Esempi Auto-Stop](#esempi-auto-stop)


## Descrizione

Lo script permette di:
- Elencare tutte le regole EventBridge in un account/ambiente
- Cercare regole per nome
- Abilitare/disabilitare regole specifiche

## Prerequisiti

- Node.js >= 18.0.0
- Accesso AWS SSO configurato per gli account destinazione

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
- `--envName, -e`: Obbligatorio. Ambiente destinazione (dev|test|hotfix)
- `--account, -a`: Obbligatorio. Account AWS (core|confinfo)
- `--ruleName, -r`: Obbligatorio per enable/disable. Nome della regola
- `--enable, -n`: Abilita la regola specificata
- `--disable, -d`: Disabilita la regola specificata
- `--help, -h`: Mostra il messaggio di aiuto

## Esempi

Elenca tutte le regole:
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

## Script ECS Auto-Stop

Lo script `ecs-manage-autostop.js` gestisce le regole EventBridge che controllano l'arresto automatico degli ambienti ECS.

### Parametri Auto-Stop

- `--envName, -e`: Obbligatorio. Ambiente destinazione (dev|test|hotfix)
- `--enable, -n`: Abilita la regola di auto-stop
- `--disable, -d`: Disabilita la regola di auto-stop
- `--help, -h`: Mostra il messaggio di aiuto

### Esempi Auto-Stop

Abilita l'arresto automatico:
```bash
node ecs-manage-autostop.js --envName dev --enable
```
Disabilita l'arresto automatico:
```bash
node ecs-manage-autostop.js --envName dev --able
```