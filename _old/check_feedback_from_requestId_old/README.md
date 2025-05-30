# Check feedback from request Id
Verifica se un request id ha un evento di SEND_ANALOG_FEEDBACK associato

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)

## Descrizione

Lo script a partire da un dump della coda pn-external-channel-to-paper-channel DLQ che tramite jq ottiene in output receipt handle e body, esegue per questi delle verifiche relativi a quali possono essere gli eventi da scartare dalla coda (e li scarta) e quali devono essere risottomessi tramite redrive. Inoltre per quelli da eliminare effettua un check di corrispondenza degli eventi sul SEND_ANALOG_FEEDBACK e l'elemento in DLQ

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
node index.js --envName <envName> --fileName <fileName>
```
Dove:
- `<envName>` è l'environment si intende eseguire la procedura;
- `<fileName>` è il file-path del file che riporta i requestId di interesse;

Esempio di formato 
{"receiptHandle": "receipthandle1", "body":{body1}}
{"receiptHandle": "receipthandle2", "body":{body2}}
{"receiptHandle": "receipthandle3", "body":{body3}}