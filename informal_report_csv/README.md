## Informal CSV Report

Script Node.js per estrarre un report in formato CSV per MVP del progetto Comunicazioni Bonarie.
Il report ( composto da diversi file) viene generato a partire dalla API GET notifica informale (single IUN o batch da file).

### Prerequisiti
- Node.js >= 18
- Accesso rete all'endpoint API
- File `.env` nella cartella `scripts/client/informal_csv_report/`

### `.env` richiesto

```env
INFORMAL_BASE_URL=https://api.dev.notifichedigitali.it
INFORMAL_API_KEY=your-api-key
# opzionale
INFORMAL_AUTH_TOKEN=your-bearer-token
```

### `.env` aggiuntivo se si usa `--mail` (US6/US7)

Il provider di invio email si sceglie con `MAIL_PROVIDER` (opzionale, default `smtp`).

**Modalità SMTP (default):**

```env
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
MAIL_FROM=noreply@example.com
# opzionale: true/false (default: true se SMTP_PORT=465, altrimenti false)
SMTP_SECURE=false
```

**Modalità AWS SES:**

```env
MAIL_PROVIDER=ses
AWS_REGION=eu-south-1
MAIL_FROM=noreply@example.com
```

In modalità `ses` le credenziali AWS **non vanno mai** in `.env` né via CLI: vengono
risolte dalla default AWS credential provider chain dell'SDK (es. il ruolo IAM
assegnato a un CodeBuild, un profilo locale, o le variabili `AWS_*` standard già
presenti nell'ambiente). Il ruolo/utente IAM usato deve avere i permessi
`ses:SendEmail`/`ses:SendRawEmail` sulla region configurata e un'identità mittente
verificata in SES.

> **Nota:** `MAIL_FROM` sostituisce la precedente `SMTP_FROM` ed è condivisa da
> entrambi i provider. Se aggiorni uno script già in uso, rinomina `SMTP_FROM` in
> `MAIL_FROM` nel tuo `.env`.

### Endpoint API (fisso nel codice)
Lo script usa sempre il contratto API seguente (non modificabile):

`/informal/delivery/v1/notifications/sent/{iun}?retrieveMessage=true`

### Installazione dipendenze

```bash
npm install
```

### Esecuzione

```bash
node export_informal_csv.js --iun MWYJ-VTHJ-RUMK-202607-T-A --output-dir ./out
```

### Parametri CLI disponibili
- `--iun` (obbligatorio se non usi `--input-file`)
- `--input-file` (opzionale, lista IUN uno per riga)
- `--output-dir` (opzionale)
- `--env-file` (opzionale, default `.env` nella cartella script)
- `--timeout-ms` (opzionale)
- `--mail <indirizzo>` (opzionale, US6/US7): invia i CSV generati come allegati a questo indirizzo.
  Richiede la configurazione email (SMTP o SES, in base a `MAIL_PROVIDER`) in `.env` (vedi sopra).

### Importante
Endpoint e credenziali **non sono overrideabili via CLI**:
- niente `--base-url`
- niente `--api-key`
- niente `--auth-token`
- niente `--endpoint-template`
- niente `--smtp-host` / `--smtp-port` / `--smtp-user` / `--smtp-password` / `--smtp-from`
- niente `--mail-provider` / `--mail-from` / `--aws-region`

Devono essere definiti nel `.env` (tranne il path endpoint che è fisso nel codice).
Con `--mail` l'unico dato accettato via CLI è l'indirizzo destinatario: le credenziali
email (SMTP o AWS) restano sempre e solo nel `.env`/ambiente, in coerenza con il
vincolo sopra.

### Output
Lo script genera solo 2 file CSV:
- `informal_summary.csv` su successo con formato: `IUN,notificationStatus,analogCost` (`analogCost` sempre `0`)
- `informal_timeline_raw.csv` su successo con formato: `IUN,TIMELINE_ELEMENT_ID,BUSINESS_TIMESTAMP,JSON`
  dove `JSON` serializza un oggetto compatibile con `ProgressResponseElementV29`:
  `eventId`, `notificationRequestId` (Base64 dell'IUN), `ttl`, `eventDescription` (`timestamp_elementId`), `iun`, `newStatus`, `informalElement`

In caso di errore su uno o più IUN, lo script stampa il dettaglio su stderr (IUN, tipo e messaggio
errore) e termina con `exit code 1`; non viene generato alcun file CSV dedicato agli errori.

US1 copre lo slice summary; US2 aggiunge la timeline raw; US4 aggiunge safety operativa (throttling globale 1 RPS + retry transient controllato); US6 aggiunge l'invio via email dei CSV generati (SMTP); US7 aggiunge AWS SES come provider di invio alternativo. L'output è stato successivamente limitato ai soli `informal_summary.csv` e `informal_timeline_raw.csv`: gli altri report (eventi, allegati, errori) generati in precedenza non vengono più prodotti.

### Vincoli operativi US4
- massimo 1 chiamata API al secondo (globale, incluse eventuali retry)
- nessuna esecuzione parallela delle chiamate
- retry automatico solo per errori transient (`408`, `429`, `500`, `502`, `503`, `504`, timeout/rete)

### Invio via email (US6/US7)

```bash
# SMTP (default, MAIL_PROVIDER non impostato o =smtp)
node export_informal_csv.js --iun MWYJ-VTHJ-RUMK-202607-T-A --output-dir ./out --mail destinatario@example.com

# AWS SES (richiede MAIL_PROVIDER=ses in .env, es. eseguito in un CodeBuild con ruolo IAM abilitato a SES)
node export_informal_csv.js --iun MWYJ-VTHJ-RUMK-202607-T-A --output-dir ./out --mail destinatario@example.com
```

Il comando CLI è identico per entrambi i provider: la scelta avviene esclusivamente
tramite `MAIL_PROVIDER` in `.env`.

- i 2 CSV vengono sempre generati e scritti su disco **prima** dell'invio
- vengono allegati sempre entrambi i file, anche se contengono solo l'header
- se l'invio (SMTP o SES) fallisce: i CSV restano disponibili in `--output-dir`, viene stampato un
  errore esplicito su stderr e lo script termina con `exit code 1`
- se la configurazione email in `.env` è incompleta (SMTP o SES, in base a `MAIL_PROVIDER`),
  lo script fallisce **prima** di iniziare l'export (fail-fast), senza generare alcun file

### Esecuzione batch (US3)

```bash
node export_informal_csv.js --input-file ./sample_iuns.txt --output-dir ./out
```

---

## Test E2E DEV manuali (US1-US5)

Sono disponibili test E2E separati per ogni User Story, con chiamata reale a DEV.

**Vincolo di sicurezza:** questi test **non devono mai partire automaticamente**.
Per questo:
- richiedono il flag esplicito `--run-dev-e2e`
- falliscono se `CI=true`

Comandi manuali:

```bash
npm run e2e:dev:us1 -- --iun MWYJ-VTHJ-RUMK-202607-T-A
npm run e2e:dev:us2 -- --iun MWYJ-VTHJ-RUMK-202607-T-A
npm run e2e:dev:us3 -- --iun MWYJ-VTHJ-RUMK-202607-T-A
npm run e2e:dev:us4 -- --iun MWYJ-VTHJ-RUMK-202607-T-A
npm run e2e:dev:us5 -- --iun MWYJ-VTHJ-RUMK-202607-T-A
npm run e2e:dev:all -- --iun MWYJ-VTHJ-RUMK-202607-T-A
```

`e2e:dev:all` è un test end-to-end globale che verifica in un unico run:
- chiamata DEV valida (seed IUN)
- esecuzione script in batch usando la lista IUN da `tmp/inputIuns.txt`
- generazione dei CSV (`summary`, `timeline_raw`)
- comportamento coerente con il vincolo 1 RPS (verifica su durata esecuzione batch multi-IUN)

Test mock automatici (senza chiamate reali DEV, SMTP né AWS SES):

```bash
npm run test:mock
```

`test:mock` esegue anche `test:mock:us6` e `test:mock:us7`, che coprono l'invio email:
US6 con un server SMTP di test locale (`smtp-server`) — invio riuscito con 2 allegati,
indirizzo non valido, `.env` SMTP incompleto e fallimento di consegna con CSV comunque
salvati su disco; US7 con lo stesso set di casi ma per il provider AWS SES, simulato
tramite un server HTTP locale che intercetta le chiamate SESv2 (nessuna chiamata AWS
reale, nessuna credenziale AWS reale coinvolta).

In alternativa puoi impostare `INFORMAL_TEST_IUN` in environment ed evitare `--iun`.

Se non specifichi né `--iun` né `INFORMAL_TEST_IUN`, i test usano automaticamente il primo IUN disponibile in `tmp/inputIuns.txt`.

### Report E2E generati
Ogni esecuzione manuale salva:
- report JSON: `tmp/e2e/reports/<timestamp>_<us>.json`
- artefatti output: `tmp/e2e/reports/<timestamp>_<us>_artifacts/`

Gli artefatti includono:
- response DEV raw/json
- (US1) CSV generati dallo script in `generated_output/`

Indice ultimi risultati:
- `tmp/e2e/reports/latest-summary.json`
