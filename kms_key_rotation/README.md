# KMS key rotation

Rinnovo delle chiavi in modalità manuale per le chiavi che non hanno rotazione automatica abilitata.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Rinnovo delle chiavi in modalità manuale per le chiavi che non hanno rotazione automatica abilitata.

## Installazione

```bash
npm install
```

## Utilizzo
### Step preliminare

```bash
aws sso login --profile sso_pn-core-<env>
```

### Esecuzione
```bash
node index.js --envName <env-name> --account <account> [--dryrun]

```
Dove:
- `<env-name>` l'environment sul quale si intende avviare lo script
- `<account>` l'account sul quale si vuole effettuare l'operazione
- `<dryrun>` se si vuole solo visualizzari quali chiavi KMS verrebbero ruotate.