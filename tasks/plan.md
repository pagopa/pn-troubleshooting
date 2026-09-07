# Implementation Plan: Invio report via AWS SES (alternativa a SMTP)

## Overview

Lo script `informal_report_csv` invia oggi i CSV generati via SMTP (`--mail <indirizzo>`
+ credenziali `SMTP_*` in `.env`). Aggiungiamo un secondo provider di invio, **AWS
SES**, selezionabile tramite `MAIL_PROVIDER=smtp|ses` in `.env` (default `smtp`,
retrocompatibile). In modalità `ses` lo script userà `@aws-sdk/client-sesv2` tramite il
transport SES nativo di `nodemailer`, autenticandosi solo con la default AWS credential
provider chain (es. ruolo IAM di un CodeBuild) — nessuna gestione custom di access
key/secret. Il mittente diventa una variabile unica e condivisa `MAIL_FROM` (rename
netto, breaking, di `SMTP_FROM`).

## Architecture Decisions

- **Switch esplicito via `.env`** (`MAIL_PROVIDER`), non auto-detect e non nuova flag
  CLI: coerente col vincolo esistente "niente endpoint/credenziali via CLI" e con lo
  stile fail-fast già usato per SMTP.
- **Riuso di nodemailer** con il suo transport SES nativo (`SESv2Client` +
  `SendEmailCommand`) invece di un path SES scritto da zero: minimizza il diff, riusa
  subject/body/allegati/gestione errori già testati.
- **Solo ruolo IAM / default credential chain**: nessuna variabile `.env` per access
  key/secret AWS. Solo `AWS_REGION` (obbligatoria, fail-fast) è letta esplicitamente.
- **`MAIL_FROM` unico e condiviso** tra SMTP e SES, in sostituzione netta di
  `SMTP_FROM` (nessun fallback silenzioso, richiesto esplicitamente dall'utente).
- **Test SES end-to-end** speculare a `tests/us6.mock.test.js`: spawna il CLI reale via
  `execFile`, redirige il client SESv2 verso un server HTTP locale tramite la
  variabile standard AWS SDK v3 `AWS_ENDPOINT_URL_SESV2` + credenziali statiche
  fittizie nell'ambiente del child process. Nessun meccanismo di test-only introdotto
  nel codice di produzione.

## Task List

### Phase 1: Foundation — transport layer

- [ ] Task 1: Dispatcher provider SMTP/SES in `lib/mailer.js` + dipendenza SDK
- [ ] Task 2: Config multi-provider in `export_informal_csv.js`

### Checkpoint: Foundation
- [ ] `npm run check` passa (nessun errore di sintassi)
- [ ] `node -e "require('./lib/mailer.js')"` non solleva errori con
  `@aws-sdk/client-sesv2` installato
- [ ] Percorso SMTP esistente resta compilabile e concettualmente invariato (verifica
  a occhio del diff: nessuna modifica al ramo `provider === 'smtp'`)

### Phase 2: Test coverage

- [ ] Task 3: Aggiornare test SMTP esistente per il rename `MAIL_FROM`
- [ ] Task 4: Nuovo test mock end-to-end per SES

### Checkpoint: Test coverage
- [ ] `npm run test:mock:us6` passa (percorso SMTP rinominato, invariato nella sostanza)
- [ ] Nuovo test mock SES passa (invio riuscito con 5 allegati, email non valida,
  config SES incompleta, fallimento invio con CSV su disco + exit code 1)
- [ ] `npm run test:mock` (suite aggregata) passa per intero

### Phase 3: Documentazione

- [ ] Task 5: Aggiornare `README.md`

### Checkpoint: Complete
- [ ] Tutti gli acceptance criteria dei Task 1-5 soddisfatti
- [ ] `npm run check` e `npm run test:mock` verdi
- [ ] Nessun riferimento residuo a `SMTP_FROM` nel repo (README, test, codice)
- [ ] Pronto per review umana

---

## Task 1: Dispatcher provider SMTP/SES in `lib/mailer.js` + dipendenza SDK

**Description:** Rendere `createTransporter(transportConfig)` un dispatcher sul campo
`transportConfig.provider`: per `smtp` (default) il comportamento resta identico a
oggi; per `ses` costruire un `SESv2Client({ region: transportConfig.region })` e
passarlo a `nodemailer.createTransport({ SES: { sesClient, SendEmailCommand } })`
(entrambi da `@aws-sdk/client-sesv2`). `sendReportEmail`, `buildSubject`, `buildBody`,
`buildAttachments` non cambiano firma né comportamento. Aggiungere
`@aws-sdk/client-sesv2` alle `dependencies` di `package.json` e installare.

**Acceptance criteria:**
- [ ] Con `transportConfig.provider === 'smtp'` (o assente, per retrocompatibilità),
  `createTransporter` produce lo stesso transport di oggi (nessuna regressione)
- [ ] Con `transportConfig.provider === 'ses'`, `createTransporter` produce un
  transport nodemailer basato su `SESv2Client` con la region da
  `transportConfig.region`, senza leggere/gestire access key esplicite
- [ ] `sendReportEmail` funziona identicamente con entrambi i transport (stesso
  `from`, `to`, `subject`, `text`, `attachments`)

**Verification:**
- [ ] `npm run check` (node --check su export_informal_csv.js) resta verde
- [ ] `node --check lib/mailer.js` verde
- [ ] Ispezione manuale: nessuna riga del ramo SMTP esistente modificata al di fuori
  dell'estrazione in dispatcher

**Dependencies:** None

**Files likely touched:**
- `informal_report_csv/lib/mailer.js`
- `informal_report_csv/package.json`
- `informal_report_csv/package-lock.json`

**Estimated scope:** Small (2-3 files)

---

## Task 2: Config multi-provider in `export_informal_csv.js`

**Description:** Sostituire `loadSmtpConfig()` con `loadMailConfig()`: legge
`MAIL_PROVIDER` (default `'smtp'`), `MAIL_FROM` (comune a entrambi i provider), e in
base al provider anche `SMTP_HOST/PORT/USER/PASSWORD` (smtp) oppure `AWS_REGION`
(ses). Rinominare `args.smtp` → `args.mailConfig` in tutto il file. Sostituire
`ensureSmtpConfigured` con un dispatcher `ensureMailConfigured(mailConfig)` che
delega a `ensureSmtpConfigured` (aggiornata per `MAIL_FROM`) o alla nuova
`ensureSesConfigured` (richiede `AWS_REGION` e `MAIL_FROM`, stesso stile di errore
aggregato "Variabile/i mancante/i o non valida/e: ..."). Aggiornare `printHelp()` con
la nuova sezione `MAIL_PROVIDER`/`AWS_REGION` e il rename `SMTP_FROM` → `MAIL_FROM`
in entrambe le sezioni esistenti. Aggiornare la chiamata `sendReportEmail({
transportConfig: args.mailConfig, ... })`. Nessuna modifica a
`DISALLOWED_OVERRIDE_FLAGS` o a `parseArgs` (nessuna nuova flag CLI).

**Acceptance criteria:**
- [ ] Con `MAIL_PROVIDER` assente o `smtp`, il comportamento a riga di comando è
  identico a oggi (stessi messaggi di errore per variabili SMTP mancanti, a parte il
  rename `SMTP_FROM`→`MAIL_FROM`)
- [ ] Con `MAIL_PROVIDER=ses` e `AWS_REGION`/`MAIL_FROM` mancanti, lo script fallisce
  **prima** di qualunque chiamata API/export, con messaggio che elenca le variabili
  mancanti (stesso stile di `ensureSmtpConfigured`)
- [ ] Con `MAIL_PROVIDER=ses` configurato correttamente, `args.mailConfig` contiene
  `{ provider: 'ses', region, from }` pronto per `sendReportEmail`
- [ ] `printHelp()` documenta `MAIL_PROVIDER`, `AWS_REGION`, `MAIL_FROM` per entrambi i
  provider senza menzionare più `SMTP_FROM`
- [ ] Nessuna nuova flag CLI introdotta; `DISALLOWED_OVERRIDE_FLAGS` invariato

**Verification:**
- [ ] `npm run check` verde
- [ ] Esecuzione manuale: `node export_informal_csv.js --help` mostra la nuova
  documentazione senza errori
- [ ] Esecuzione manuale con `.env` SMTP esistente (rinominando `SMTP_FROM` in
  `MAIL_FROM`) → comportamento invariato

**Dependencies:** Task 1

**Files likely touched:**
- `informal_report_csv/export_informal_csv.js`

**Estimated scope:** Small-Medium (1 file, ma con più funzioni toccate)

---

## Task 3: Aggiornare test SMTP esistente per il rename `MAIL_FROM`

**Description:** In `tests/us6.mock.test.js`, sostituire `SMTP_FROM` con `MAIL_FROM`
nella funzione `writeEnv` di ciascun test case SMTP. Nessun'altra modifica: il test
gira di default con `MAIL_PROVIDER` non impostato (default `smtp`), quindi valida
anche che il default provider resti `smtp` dopo le modifiche del Task 2.

**Acceptance criteria:**
- [ ] Tutte le occorrenze di `SMTP_FROM` nel file sono sostituite con `MAIL_FROM`
- [ ] Nessuna altra logica di test modificata (stessi 4 casi: successo con 5 allegati,
  email non valida, config SMTP incompleta, fallimento invio con CSV su disco)

**Verification:**
- [ ] `npm run test:mock:us6` passa (`US6 mock test passed` in stdout)

**Dependencies:** Task 2

**Files likely touched:**
- `informal_report_csv/tests/us6.mock.test.js`

**Estimated scope:** XS (1 file, sostituzione puntuale)

---

## Task 4: Nuovo test mock end-to-end per SES

**Description:** Creare un nuovo file di test (es. `tests/us7.mock.test.js`, naming da
confermare — vedi Open Questions) speculare a `us6.mock.test.js`, ma per il provider
SES: spawna il CLI reale via `execFile` (nessun mock in-process del modulo). Un server
HTTP locale simula l'endpoint SESv2 `SendEmail` e cattura il body delle richieste. Il
redirect del client SESv2 verso il server locale avviene tramite la variabile
d'ambiente standard AWS SDK v3 `AWS_ENDPOINT_URL_SESV2`, con credenziali AWS statiche
fittizie (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` dummy) impostate nell'ambiente
del child process — nessuna modifica al codice di produzione per abilitare il test.
Aggiungere lo script npm corrispondente (`test:mock:us7` o nome scelto) e includerlo
nell'aggregato `test:mock`.

**Acceptance criteria:**
- [ ] Caso successo: invio riuscito, i 5 allegati CSV attesi sono presenti nel body
  della richiesta catturata dal server SESv2 fittizio, stdout riporta conferma invio
- [ ] Caso email non valida: fallisce fail-fast prima dell'export (nessuna directory
  di output creata), stesso comportamento del percorso SMTP
- [ ] Caso config SES incompleta (`AWS_REGION` o `MAIL_FROM` mancanti): lo script
  fallisce fail-fast con messaggio che elenca le variabili mancanti, nessuna chiamata
  API/export avvenuta
- [ ] Caso fallimento invio (endpoint SES fittizio non raggiungibile/che risponde
  errore): i CSV restano su disco in `--output-dir`, exit code 1, messaggio di errore
  coerente con quello SMTP ("I CSV generati restano disponibili in: ...")
- [ ] Il nuovo script npm è incluso nell'aggregato `test:mock`

**Verification:**
- [ ] Nuovo test passa in isolamento (`npm run test:mock:us7` o nome equivalente)
- [ ] `npm run test:mock` (suite completa, incluso SMTP e SES) passa

**Dependencies:** Task 1, Task 2

**Files likely touched:**
- `informal_report_csv/tests/us7.mock.test.js` (nuovo file, nome da confermare)
- `informal_report_csv/package.json` (nuovo script + inclusione in `test:mock`)

**Estimated scope:** Medium (1 nuovo file di test consistente, 1 file di config)

---

## Task 5: Aggiornare `README.md`

**Description:** Documentare la nuova modalità SES: aggiungere `MAIL_PROVIDER` alla
sezione `.env`, un blocco di esempio per SES (`AWS_REGION`, `MAIL_FROM`) accanto al
blocco SMTP aggiornato (rename `SMTP_FROM`→`MAIL_FROM`), una nota esplicita sul fatto
che le credenziali AWS non vanno mai in `.env`/CLI ma derivano dal ruolo IAM (es.
CodeBuild) o dall'ambiente AWS standard, ed un esempio d'uso in modalità SES nella
sezione "Invio via email".

**Acceptance criteria:**
- [ ] Sezione `.env` documenta sia il blocco SMTP (con `MAIL_FROM`) sia il blocco SES
  (`MAIL_PROVIDER=ses`, `AWS_REGION`, `MAIL_FROM`)
- [ ] Nessun riferimento residuo a `SMTP_FROM` nel README
- [ ] Presente una nota esplicita su credenziali AWS = ruolo IAM/ambiente standard, mai
  in `.env`/CLI
- [ ] Presente almeno un esempio di comando con `MAIL_PROVIDER=ses` impostato

**Verification:**
- [ ] Lettura manuale del README aggiornato: coerente con il comportamento reale dello
  script dopo Task 1-4
- [ ] `grep -ri "SMTP_FROM" README.md` non produce risultati

**Dependencies:** Task 2

**Files likely touched:**
- `informal_report_csv/README.md`

**Estimated scope:** XS (1 file, solo documentazione)

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `nodemailer` + `SESv2Client` non gestisce correttamente gli allegati MIME come SMTP | Alto | Verificato nel Task 4: il test mock ispeziona il body della richiesta catturata dal server SESv2 fittizio per confermare la presenza dei 5 allegati |
| Rename `SMTP_FROM`→`MAIL_FROM` rompe `.env` esistenti in produzione senza preavviso | Medio | Documentato esplicitamente nel README (Task 5); decisione presa consapevolmente con l'utente durante l'idea-refine |
| `AWS_ENDPOINT_URL_SESV2` non supportata dalla versione di `@aws-sdk/client-sesv2` installata | Medio | Verificare la versione installata durante il Task 1/4; se non supportata, usare l'opzione esplicita `endpoint` nel costruttore `SESv2Client` solo nel test (non in produzione) |
| Ruolo IAM del CodeBuild target non ha i permessi `ses:SendEmail`/identità mittente non verificata | Alto (ma fuori scope codice) | Non mitigabile da codice; da validare in fase di deploy/infrastruttura, non blocca questo piano |

## Open Questions

- Naming definitivo del file/script di test mock SES (`us7` o altra convenzione) — da
  allineare a eventuale numerazione "US" già in uso nel backlog del repo, se esiste una
  user story assegnata per questa feature.
