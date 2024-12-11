# False negative ec tracker

Rimuove tutti i falsi negativi presenti nella coda DLQ pn-ec-tracker.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Verifica le condizioni dei messaggi e rimuove quelli che risultano falsi negativi.

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
node index.js --envName <envName> --fileName <fileName> --channelType <channel-type>
```
Dove:
- `<envName>` l'env dove viene eseguito lo script;
- `<fileName>` file dato in input che deve essere un dump di dump-sqs script;
- `<channel-type>` inserire su quale canale effettuare l'analisi pec/email/cartaceo
