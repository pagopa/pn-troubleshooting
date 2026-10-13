# Piano: ultimo canale consegnato nel report informal

## Stato e obiettivo

Piano approvato per l'esecuzione il 2026-10-07; T1-T7 completati.
Riferimento: [specifica](./SPEC-last-delivered-channel.md).
Implementazione e verifiche locali completate, senza commit o chiamate DEV.

Aggiungere `lastDeliveredChannel` come quarta colonna del summary,
ricavata dall'ultimo `DELIVERED`. Per ANALOG risolvere il prodotto postale
dall'evento collegato; nessuna consegna equivale a campo vuoto.

## Decisioni tecniche

- Helper puro CommonJS in `lib/lastDeliveredChannel.js`, testabile senza
  avviare la CLI, leggere credenziali o interrogare API.
- Un indice `elementId -> elemento` per risolvere `sourceElementId`.
  Scansione della timeline senza ordinarla o mutarla: costo lineare rispetto
  agli elementi, memoria lineare per l'indice.
- Confrontare gli istanti conservando le frazioni sub-millisecondo.
  Non usare il solo `Date.parse`, che perderebbe precisione presente
  nell'esempio, ne' confronti lessicografici tra timestamp non normalizzati.
  Validare il formato ISO supportato e normalizzare offset/frazioni;
  formati non supportati devono produrre errore esplicito.
- Validare i DELIVERED secondo la specifica; gli errori vengono propagati
  alla gestione per IUN gia' presente nella CLI. Non inferire il canale
  da `elementId`, codici postali, stato workflow o destinatari configurati.
- Nessuna nuova dipendenza, flag CLI o modifica a mailer, endpoint,
  rate limiting, retry e serializzazione timeline raw.

## Dipendenze e ordine

```text
T1 helper digitale e selezione temporale
  -> T2 risoluzione ANALOG e dati incompleti
    -> T3 integrazione CSV e regressioni di base
      -> T4 batch con errori di estrazione
      -> T5 allegati SMTP/SES
      -> T6 contratto E2E manuale e documentazione
T4 + T5 + T6 -> T7 verifica conclusiva
```

Ogni task funzionale segue test fallente -> implementazione -> test verde.
T1 e T2 aggiungono logica testata senza cambiare ancora il report in produzione.

## T1: selezione della consegna digitale

**Interventi:** introdurre il helper puro; filtrare DELIVERED, confrontare
timestamp, gestire fallback a timestamp e parita'; restituire IO/PEC/SMS/EMAIL.
Usare fixture sintetiche e test Node.js senza server per questi casi.

**Accettazione:**
- [x] Tutti i canali digitali sono coperti; timeline assente/vuota e soli
  invii o feedback OK producono stringa vuota.
- [x] Timeline disordinata, piu' destinatari e tentativi falliti successivi
  non alterano la selezione dell'ultima consegna.
- [x] Frazioni con precisioni diverse, offset equivalenti, fallback,
  parita' e timestamp non validi hanno risultati deterministici.

**Verifica:**
```bash
node --test informal_report_csv/tests/lastDeliveredChannel.test.js
node --check informal_report_csv/lib/lastDeliveredChannel.js
```

**Dipendenze:** nessuna.
**File:** `lib/lastDeliveredChannel.js`, `tests/lastDeliveredChannel.test.js`.
**Dimensione:** S, 2 file.

## T2: prodotto postale e validazione dei dati

**Interventi:** risolvere sourceElementId nella stessa timeline; ricavare
deliveryType dal feedback collegato. Aggiungere errori diagnostici con
identificativo dell'evento e campo problematico, senza indirizzi o payload.

**Accettazione:**
- [x] IO KO -> ANALOG OK -> DELIVERED -> chiusura workflow produce ANALOG_RS;
  un altro deliveryType sintetico viene riportato senza whitelist di prodotti.
- [x] Con piu' invii ANALOG, il prodotto proviene dall'esatto evento collegato,
  anche se gli elementi sono disordinati.
- [x] Canale assente/non supportato, sourceElementId assente/non risolvibile
  e deliveryType mancante/vuoto producono errori, mai fallback success-shaped.

**Verifica:** stessi comandi di T1 con tutti i nuovi casi.
**Dipendenze:** T1.
**File:** `lib/lastDeliveredChannel.js`, `tests/lastDeliveredChannel.test.js`.
**Dimensione:** S, 2 file.

### Checkpoint A: correttezza del calcolo

- [x] Matrice unitaria verde, nessun dato personale nelle fixture.
- [x] Revisione delle regole temporali e risoluzione ANALOG rispetto alla spec.
- [x] Timeline in input non mutata dal helper.

## T3: nuova colonna nel CSV

**Interventi:** richiamare il helper da buildSummaryRow e aggiungere la quarta
colonna all'header di writeCsv. Registrare `test:unit:channel` nel package.json
e includerlo nel comando test:mock. Adeguare i tre mock con header esatto.

**Accettazione:**
- [x] Header esattamente IUN,notificationStatus,analogCost,lastDeliveredChannel;
  dati preesistenti invariati e analogCost sempre 0.
- [x] I mock attuali senza DELIVERED hanno campo vuoto, anche con stato
  COMPLETED_REACHED; almeno un caso CLI verifica ANALOG_RS.
- [x] Header e contenuto semantico del raw restano invariati; modifiche
  alle fixture non mascherano regressioni degli eventi preesistenti.

**Verifica:**
```bash
npm --prefix informal_report_csv run check
npm --prefix informal_report_csv run test:unit:channel
npm --prefix informal_report_csv run test:mock:us2
npm --prefix informal_report_csv run test:mock:us3
npm --prefix informal_report_csv run test:mock:us4
```

`test:unit:channel` aggiunto e incluso in `test:mock`.
**Dipendenze:** T2.
**File:** `export_informal_csv.js`, `package.json`, `tests/us2.mock.test.js`,
`tests/us3.mock.test.js`, `tests/us4.mock.test.js`.
**Dimensione:** M, 5 file; nessuna variazione dipendenze o lockfile necessaria.

## T4: errori di estrazione nei batch

**Interventi:** ampliare il mock batch per distinguere nessuna consegna da
consegna malformata. Usare la gestione errori esistente, senza nuovi report.

**Accettazione:**
- [x] Uno IUN senza DELIVERED resta nel summary con campo vuoto.
- [x] Uno IUN con DELIVERED malformato produce stderr identificabile e
  exit code 1; non compare come successo nel summary.
- [x] Gli altri IUN continuano a essere processati; deduplica e due file
  di output restano coerenti con il comportamento batch attuale.

**Verifica:** `npm --prefix informal_report_csv run test:mock:us3`.
**Dipendenze:** T3.
**File:** `tests/us3.mock.test.js`; `export_informal_csv.js` solo se emergono
problemi direttamente introdotti dall'integrazione.
**Dimensione:** S, massimo 2 file.

## T5: verifica del summary negli allegati

**Interventi:** aggiungere un DELIVERED sintetico ai mock email e verificare
che il contenuto del CSV allegato abbia header e valore nuovi, oltre ai nomi.

**Accettazione:**
- [x] SMTP e SES continuano a inviare esattamente i due report.
- [x] Il summary salvato e quello allegato contengono la nuova colonna
  con il valore atteso; nessun intervento sul mailer necessario.
- [x] Fallimenti invio e validazione configurazione conservano exit code
  e disponibilita' dei CSV secondo i test esistenti.

**Verifica:**
```bash
npm --prefix informal_report_csv run test:mock:us6
npm --prefix informal_report_csv run test:mock:us7
```

**Dipendenze:** T3.
**File:** `tests/us6.mock.test.js`, `tests/us7.mock.test.js`,
`tests/mimeAssertions.js` (verifica condivisa del contenuto MIME).
**Dimensione:** M, 3 file.

### Checkpoint B: integrazione

- [x] Calcolo unitario, CSV, batch e mock email verdi.
- [x] Nessuna modifica a rate limiting, retry o raw.
- [x] Solo dati sintetici e servizi locali nelle verifiche.

## T6: E2E manuale e documentazione

**Interventi:** adeguare l'header nel test E2E globale; documentare schema
CSV, significato della colonna, aggregazione per IUN, timestamp, assenza
consegne ed errori dati. Segnalare ai consumatori l'aggiunta della colonna.

**Accettazione:**
- [x] README descrive esattamente il comportamento implementato,
  con esempio ANALOG_RS e caso campo vuoto.
- [x] E2E globale attende quattro colonne; nessuna chiamata DEV automatica.
- [x] Spec allineata alle decisioni finali senza dichiarare verificato
  un contratto digitale reale non ancora osservato.

**Verifica:**
```bash
npm --prefix informal_report_csv run check:e2e
```

Revisione manuale della documentazione; E2E DEV solo su richiesta esplicita.
**Dipendenze:** T3.
**File:** `e2e/us_all.dev.e2e.js`, `README.md`, `SPEC-last-delivered-channel.md`.
**Dimensione:** M, 3 file.

## T7: verifica conclusiva e revisione

**Interventi:** eseguire la suite locale completa correlata, revisionare diff
e matrice di accettazione; aggiornare le checkbox del piano con gli esiti.

**Accettazione:**
- [x] Tutti i casi della specifica sono coperti e passano.
- [x] Cambiamenti limitati alla funzionalita', alle aspettative correlate
  e alla documentazione; nessun dato personale o segreto introdotto.
- [x] Resoconto finale distingue verifiche mock da quelle reali non eseguite.

**Verifica:**
```bash
npm --prefix informal_report_csv run check
npm --prefix informal_report_csv run test:mock
npm --prefix informal_report_csv run check:e2e
git diff --check
```

**Dipendenze:** T4, T5, T6.
**File:** questo piano, per registrare gli esiti; nessun file applicativo
salvo correzioni strettamente correlate emerse dalle verifiche.
**Dimensione:** S.

## Rischi e mitigazioni

| Rischio | Impatto | Mitigazione |
|---|---|---|
| DELIVERED digitale non ancora osservato | Alto | Test sintetici sul contratto concordato; confrontare esempi anonimizzati quando disponibili, senza fallback inventati |
| Perdita precisione temporale | Alto | Test sub-millisecondo, frazioni diverse e offset; confronto normalizzato |
| Collegamento ANALOG incompleto | Alto | Errore per IUN, non prodotto indovinato ne' campo vuoto |
| Consumatori legati a tre colonne | Medio | Colonna in fondo, documentazione esplicita e header esatto nei test |
| Output raw alterato dal calcolo | Medio | Helper senza mutazioni, regressioni sul contenuto raw |

## Parallelismo e confini

T1 -> T2 -> T3 sono sequenziali. Dopo T3, T4, T5 e T6 possono procedere
in parallelo su file distinti; la suite finale si esegue sequenzialmente
per evitare conflitti tra server mock che usano porte prefissate.
Non serve delegazione per le dimensioni attuali del lavoro.

## Esiti dell'esecuzione

- T1: test inizialmente fallenti per helper assente, poi 14 test verdi.
- T2: 10 nuovi casi ANALOG inizialmente fallenti, poi matrice verde.
- T3: ripristinate le dipendenze dal lockfile con `npm ci` dopo errore
  modulo dotenv assente; header nuovo inizialmente fallente, poi US2-US4 verdi.
- T4: verificati nello stesso batch IUN senza consegna, HTTP 404,
  consegna ANALOG incompleta e consegna IO successiva; exit code 1,
  successi preservati e deduplica invariata.
- T5: aspettative su canali negli allegati inizialmente fallenti,
  poi SMTP e SES locali verdi; confronto di entrambi gli allegati con
  i CSV su disco tramite helper MIME condiviso, senza nuove dipendenze.
- T6: README, specifica e header E2E aggiornati; controllo sintattico verde.
- T7: 29 test unitari e tutti i mock US2/US3/US4/US6/US7 verdi;
  `check`, `check:e2e` e `git diff --check` completati.
- Esempio CSV fornito dall'utente: lettura locale degli informalElement e
  verifica del risultato `ANALOG_RS`, senza copiare dati personali nel repository.

Revisione diretta del diff e del helper: selezione, precisione, errori,
assenza di mutazioni e superficie di integrazione coerenti con la specifica.
I test modificati eliminano le proprie directory temporanee a fine run.

Non eseguiti: E2E DEV, SMTP/SES reali, test Docker. Nessun commit o pubblicazione.
Il contratto digitale reale resta da verificare su esempi anonimizzati.
