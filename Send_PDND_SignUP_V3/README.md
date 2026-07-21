# SEND PDND SignUP v3

Automazione per verificare e approvare fruizioni e finalita SEND tramite PDND Core v3 e Selfcare.

## Esecuzione locale

Creare `.env` partendo da `.env.example`. La chiave della client assertion deve rimanere fuori
dal repository. La chiave DPoP viene generata in memoria a ogni avvio e usata soltanto per il
voucher della sessione corrente. La configurazione PDND (`BASE_URL`, `SERVICE_ID`, `ISSUER`,
`PRODUCER_ID` e `KID`) e obbligatoria e non ha valori incorporati nel codice.

Dry-run, senza approvazioni:

```bash
node index.js --dry-run
```

Esecuzione reale:

```bash
node index.js
```

La durata totale viene stampata nei log e restituita nel campo `durationMs`.

## Lambda

- Handler: `lambda.handler`
- Timeout consigliato: 5 minuti
- Variabili: `ENV`, `BASE_URL`, `SERVICE_ID`, `ISSUER`, `PRODUCER_ID`, `KID`,
  `PRIVATE_KEY_SECRET_ID`, `SELFCARE_APIKEY_SECRET_ID`
- IAM: `secretsmanager:GetSecretValue` limitato ai due secret

Dry-run Lambda:

```json
{
  "dryRun": true
}
```

Esecuzione reale Lambda:

```json
{}
```

Il secret della client assertion puo contenere il PEM oppure:

```json
{
  "clientAssertionPrivateKey": "-----BEGIN PRIVATE KEY-----..."
}
```

Il secret Selfcare puo essere una stringa oppure:

```json
{
  "selfcareApiKey": "..."
}
```

## Build e test

```bash
npm install
npm test
npm run build:lambda
```

Artefatto: `dist/send-pdnd-signup-v3.zip`.

Le chiamate PDND e Selfcare sono distanziate per default di 750 ms. Selfcare effettua al massimo
5 tentativi. La DPoP segue la [guida PDND](https://developer.pagopa.it/it/pdnd-interoperabilita/guides/manuale-operativo-pdnd-interoperabilita/v1.0/tutorial/tutorial-generali/come-richiedere-un-voucher-bearer-per-le-api-di-pdnd-interoperabilita-1)
e [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html).
