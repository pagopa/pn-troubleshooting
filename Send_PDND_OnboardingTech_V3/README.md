# SEND PDND OnboardingTech v3

Automazione read-only che produce il report degli enti con onboarding tecnico SEND.

Un ente entra nel report quando:

- e presente in `pn-OnboardInstitutions`;
- possiede almeno una API key `ENABLED` con `pdnd=true` in `pn-apiKey`;
- possiede almeno una finalita `ACTIVE` sull'e-service SEND in PDND Core v3.

Piu finalita o API key dello stesso ente producono comunque una sola riga.

## Esecuzione locale

Creare `.env` partendo da `.env.example`. La chiave della client assertion deve rimanere fuori
dal repository. La chiave DPoP viene generata in memoria per ogni esecuzione.

```bash
node index.js
```

L'automazione non effettua modifiche, quindi non richiede `--dry-run`. Per default usa il profilo
AWS `sso_pn-core-prod-ro` in `eu-south-1` e genera:

```text
reports/out-onBoardingTech.csv
```

Le finalita vengono richieste per piccoli gruppi di tenant per evitare duplicazioni o record
saltati dalla paginazione globale PDND. Nei log vengono stampati avanzamento, conteggi e durata;
il risultato contiene anche `durationMs`.

## Lambda

- Handler: `lambda.handler`
- Timeout consigliato: 12 minuti
- Variabili: `ENV=prod`, `PRIVATE_KEY_SECRET_ID`, `AWS_REGION=eu-south-1`
- IAM: `secretsmanager:GetSecretValue` sul secret della client assertion
- IAM: `dynamodb:Scan` su `pn-OnboardInstitutions` e `pn-apiKey`

Evento Lambda:

```json
{}
```

In Lambda il CSV viene scritto in `/tmp/out-onBoardingTech.csv`. La risposta contiene conteggio,
path e durata; un eventuale invio o caricamento persistente del file andra aggiunto separatamente.

Il secret puo contenere direttamente il PEM oppure:

```json
{
  "clientAssertionPrivateKey": "-----BEGIN PRIVATE KEY-----..."
}
```

## Build e test

```bash
npm install
npm test
npm run build:lambda
```

Artefatto: `dist/send-pdnd-onboarding-tech-v3.zip`.

La DPoP segue la [guida PDND](https://developer.pagopa.it/it/pdnd-interoperabilita/guides/manuale-operativo-pdnd-interoperabilita/v1.0/tutorial/tutorial-generali/come-richiedere-un-voucher-bearer-per-le-api-di-pdnd-interoperabilita-1)
e [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html).
