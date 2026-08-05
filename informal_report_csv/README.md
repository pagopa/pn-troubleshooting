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

### Importante
Endpoint e credenziali **non sono overrideabili via CLI**:
- niente `--base-url`
- niente `--api-key`
- niente `--auth-token`
- niente `--endpoint-template`

Devono essere definiti nel `.env` (tranne il path endpoint che è fisso nel codice).

### Output
- `informal_summary.csv` su successo con formato: `IUN,notificationStatus,analogCost` (`analogCost` sempre `0`)
- `informal_events.csv` su successo (US2)
- `informal_timeline_raw.csv` su successo (US2) con formato: `IUN,TIMELINE_ELEMENT_ID,BUSINESS_TIMESTAMP,JSON`
  dove `JSON` serializza un oggetto compatibile con `ProgressResponseElementV29`:
  `eventId`, `notificationRequestId` (se presente), `iun`, `newStatus`, `element`
- `informal_attachments.csv` su successo (US3, metadata-only)
- `informal_errors.csv` su errore (anche cumulativo in batch US3)

US1 copre lo slice summary; US2 aggiunge eventi e timeline raw; US3 aggiunge batch IUN + attachments metadata; US4 aggiunge safety operativa (throttling globale 1 RPS + retry transient controllato).

### Vincoli operativi US4
- massimo 1 chiamata API al secondo (globale, incluse eventuali retry)
- nessuna esecuzione parallela delle chiamate
- retry automatico solo per errori transient (`408`, `429`, `500`, `502`, `503`, `504`, timeout/rete)

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
- generazione di tutti i CSV (`summary`, `events`, `timeline_raw`, `attachments`, `errors`)
- comportamento coerente con il vincolo 1 RPS (verifica su durata esecuzione batch multi-IUN)

Test mock automatici (senza chiamate reali DEV):

```bash
npm run test:mock
```

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
