# Todo: Invio report via AWS SES (alternativa a SMTP)

Riferimento completo: [tasks/plan.md](./plan.md)

## Phase 1: Foundation — transport layer

- [x] **Task 1** — Dispatcher provider SMTP/SES in `lib/mailer.js` + dipendenza SDK
  - [x] `createTransporter` dispatcha su `transportConfig.provider` (`smtp` invariato, `ses` nuovo)
  - [x] Ramo `ses`: `SESv2Client({ region })` + `nodemailer.createTransport({ SES: { sesClient, SendEmailCommand } })`
  - [x] Nessuna gestione esplicita di access key/secret AWS
  - [x] `@aws-sdk/client-sesv2` aggiunta a `package.json` e installata
  - [x] Verifica: `npm run check` verde, `node --check lib/mailer.js` verde

- [x] **Task 2** — Config multi-provider in `export_informal_csv.js`
  - [x] `loadMailConfig()` sostituisce `loadSmtpConfig()` (legge `MAIL_PROVIDER`, `MAIL_FROM`, + campi per-provider)
  - [x] `args.smtp` rinominato in `args.mailConfig` ovunque
  - [x] `ensureMailConfigured()` dispatcher → `ensureSmtpConfigured` (aggiornata) / `ensureSesConfigured` (nuova, richiede `AWS_REGION` + `MAIL_FROM`)
  - [x] `printHelp()` aggiornato: `MAIL_PROVIDER`, `AWS_REGION`, rename `SMTP_FROM`→`MAIL_FROM`
  - [x] Nessuna nuova flag CLI, `DISALLOWED_OVERRIDE_FLAGS` esteso con `--mail-provider`/`--mail-from`/`--aws-region` per messaggi d'errore chiari
  - [x] Verifica: `npm run check` verde; `--help` mostra doc corretta

### Checkpoint: Foundation
- [x] `npm run check` passa
- [x] Ramo SMTP esistente concettualmente invariato (diff review)
- [x] `require('./lib/mailer.js')` non solleva errori con la nuova dipendenza installata

## Phase 2: Test coverage

- [x] **Task 3** — Rename `SMTP_FROM`→`MAIL_FROM` in `tests/us6.mock.test.js`
  - [x] Tutte le occorrenze sostituite in `writeEnv`
  - [x] Nessun'altra modifica al test
  - [x] Verifica: `npm run test:mock:us6` passa

- [x] **Task 4** — Nuovo test mock end-to-end per SES
  - [x] Nuovo file `tests/us7.mock.test.js`, stile `execFile` come us6
  - [x] Server HTTP locale che simula endpoint SESv2 `SendEmail`
  - [x] Redirect via `AWS_ENDPOINT_URL_SESV2` + credenziali AWS fittizie nel child process
  - [x] Caso: successo con 5 allegati verificati nel body catturato
  - [x] Caso: email non valida → fail-fast pre-export
  - [x] Caso: config SES incompleta (`AWS_REGION`/`MAIL_FROM` mancanti) → fail-fast
  - [x] Caso: fallimento invio → CSV su disco, exit code 1
  - [x] Nuovo script npm aggiunto e incluso in `test:mock`
  - [x] Verifica: nuovo test passa in isolamento
  - [x] **Hardening emerso in review:** estratto `tests/testEnv.js` (allowlist di env sicure per il child process) e applicato a *tutti* i test mock (`us2`, `us3`, `us4`, `us6`, `us7`), non solo a `us7`: senza questa protezione, variabili ambientali reali (`AWS_REGION`, `MAIL_FROM`, `INFORMAL_BASE_URL`, `SMTP_HOST`, ...) già presenti nella shell di chi esegue i test avrebbero silenziosamente scavalcato il `.env` di test (dotenv non sovrascrive variabili già impostate), rischiando chiamate di rete reali verso AWS/SMTP/API reali invece dei server locali fittizi

### Checkpoint: Test coverage
- [x] `npm run test:mock:us6` passa
- [x] Nuovo test mock SES passa (tutti e 4 i casi)
- [x] `npm run test:mock` (suite aggregata) passa per intero

## Phase 3: Documentazione

- [x] **Task 5** — Aggiornare `README.md`
  - [x] Sezione `.env`: blocco SMTP aggiornato (`MAIL_FROM`) + nuovo blocco SES (`MAIL_PROVIDER`, `AWS_REGION`, `MAIL_FROM`)
  - [x] Nota esplicita: credenziali AWS = ruolo IAM/ambiente standard, mai `.env`/CLI
  - [x] Esempio d'uso con `MAIL_PROVIDER=ses`
  - [x] Nessun riferimento residuo a `SMTP_FROM` come variabile ancora attiva (l'unica occorrenza rimasta è la nota di migrazione intenzionale "MAIL_FROM sostituisce SMTP_FROM")

### Checkpoint: Complete
- [x] Tutti gli acceptance criteria dei Task 1-5 soddisfatti
- [x] `npm run check` e `npm run test:mock` verdi
- [x] `grep -ri "SMTP_FROM"` nel repo produce solo la nota di migrazione intenzionale nel README (nessun riferimento come variabile ancora attiva)
- [x] Pronto per review umana
