# Query PREPARE_ANALOG_DOMICILE su Athena

Script Python per interrogare Athena ed analizzare tutte le `PREPARE_ANALOG_DOMICILE` in un intervallo temporale specifico. L'intervallo e' automatizzato in base al valore last_update nel file statistics.json, se non presente analizza le ultime 24 ore. (volendo si puo' forzare cambiando l'orario nel file json delle statistiche)

## Requisiti

```bash
pip install boto3
```

## Configurazione AWS

Assicurati di avere configurato i profili AWS in `~/.aws/credentials` e `~/.aws/config`.

## Utilizzo

### Utilizzo base con profilo AWS

```bash
python query_prepare_analog_domicile.py \
  --profile nome-profilo \
  --output-location s3://bucket-name/athena-results/
```

Questo comando eseguirà un'analisi incrementale:
- **Prima esecuzione**: Cerca PREPARE nell'intervallo **[-24 ore, -1 ora]**
- **Esecuzioni successive**: Riprende da dove si era fermato (usa `last_update` da statistics.json)

### Utilizzo con intervallo temporale personalizzato 

```bash
python query_prepare_analog_domicile.py \
  --profile nome-profilo \
  --output-location s3://bucket-name/athena-results/ \
  --start-time "2024-12-15 10:00:00" \
  --end-time "2024-12-15 18:00:00"
```

### Parametri

- `--profile`: **(Obbligatorio)** Profilo AWS da utilizzare per l'autenticazione
- `--output-location`: **(Obbligatorio)** Percorso S3 dove salvare i risultati della query Athena
- `--database`: **(Opzionale)** Database Athena da utilizzare (default: `cdc_analytics_database`)
- `--table`: **(Opzionale)** Tabella Athena da interrogare (default: `pn_timelines_json_view`)
- `--workgroup`: **(Opzionale)** Workgroup Athena da utilizzare (default: `primary`)
- `--start-time`: **(Opzionale)** Ora di inizio assoluta nel formato `YYYY-MM-DD HH:MM:SS`. Se non specificato, usa `last_update` da statistics.json o default -24h
- `--end-time`: **(Opzionale)** Ora di fine assoluta nel formato `YYYY-MM-DD HH:MM:SS` (default: now - 1 ora)
- `--full-analysis`: **(Opzionale)** Flag per attivare la modalità full analysis che stampa tutti i risultati, non solo i casi con hasResult=false e isInPaperRequestError=false
- `--timeout`: **(Opzionale)** Timeout in secondi per l'esecuzione (default: 840 = 14 minuti per mettere script in una Lambda)
- `--s3-result-bucket`: **(Opzionale)** Bucket S3 dove salvare i file JSON di risultato (es: `s3://bucket-name/path/`). Se non specificato, salva in locale nella cartella `result/`

## Esempi

### Esempio 1: Query con profilo specifico

```bash
python query_prepare_analog_domicile.py \
  --profile prod \
  --output-location s3://pn-athena-results/queries/
```

### Esempio 2: Query con date assolute

```bash
python query_prepare_analog_domicile.py \
  --profile dev \
  --output-location s3://pn-athena-results/queries/ \
  --start-time "2024-12-14 00:00:00" \
  --end-time "2024-12-14 23:00:00"
```

### Esempio 3: Query con full analysis (stampa tutti i risultati)

```bash
python query_prepare_analog_domicile.py \
  --profile dev \
  --output-location s3://pn-athena-results/queries/ \
  --full-analysis
```

### Esempio 4: Salvataggio risultati su S3 invece che locale

```bash
python query_prepare_analog_domicile.py \
  --profile prod \
  --output-location s3://pn-athena-results/queries/ \
  --s3-result-bucket s3://pn-results-bucket/prepare-analysis/
```

In questo caso i file `prepare_analog_domicile_latest.json` e `statistics.json` verranno salvati su S3 invece che nella cartella locale `result/`.

## Logica delle Finestre Temporali

### Esecuzione Incrementale (Automatica)
Lo script utilizza `statistics.json` per esecuzioni incrementali senza gap:
- **Prima esecuzione**: Analizza `[-24h, now-1h]`
- **Esecuzioni successive**: Riprende da `last_update` salvato in `statistics.json`
- **Esempio**: Se `last_update = 2024-12-17 10:00:00`, la prossima esecuzione analizzerà `[2024-12-17 10:00:00, now-1h]`

### Query PREPARE_ANALOG_DOMICILE
- **Default automatico**: `[last_update, now-1h]` (se esiste statistics.json) oppure `[-24h, now-1h]` (prima esecuzione)
- **Manuale**: `--start-time` e `--end-time` per sovrascrivere il comportamento automatico
- Cerca i PREPARE in una finestra temporale incrementale senza sovrapposizioni

### Query Follow-up (SEND/COMPLETELY_UNREACHABLE)
- Gli eventi follow-up vengono sempre cercati da `start-time` fino a `now` (ora corrente)
- Questo assicura che vengano catturati anche eventi arrivati dopo l'end-time delle PREPARE

### Timeout e Lambda
- **Timeout**: 14 minuti (840 secondi) per compatibilità Lambda (max 15 minuti)
- **Checkpoint**: Se raggiunto il timeout, salva i progressi e riprende al prossimo giro
- **Parametrizzabile**: `--timeout SECONDI` per personalizzare

## Output

Lo script produce due tipi di output:

1. **Output in console**: Visualizza i parametri della query, lo stato di esecuzione e il progresso delle verifiche
2. **File JSON locale**: Salva tutti i risultati nella cartella `result/` con nome `prepare_analog_domicile_latest.json` (aggiornamento incrementale)
3. **File CSV su S3**: Salva i risultati completi nel bucket S3 configurato

### Struttura del file JSON

Il file `prepare_analog_domicile_latest.json` contiene solo i casi problematici (hasResult=false e NON in PaperRequestError):

```json
{
  "analysis": [
    {
      "timestamp": "2025-12-17T14:30:25.000Z",
      "iun": "LQGW-YUXK-ZKLV-202512-H-1",
      "timelineElementId": "PREPARE_ANALOG_DOMICILE.IUN_...",
      "hasResult": false,
      "isInPaperRequestError": false
    }
  ]
}
```

### Statistiche e Monitoraggio

Il file `statistics.json` (locale in `result/` oppure su S3) mantiene uno storico delle ultime 30 esecuzioni con le seguenti metriche:

```json
{
  "last_update": "2025-12-17 13:56:40",
  "summary": {
    "total_open_cases": 0,
    "resolved_in_last_run": 0,
    "new_in_last_run": 0
  },
  "history": [
    {
      "timestamp": "2025-12-17 13:56:40",
      "total_iun_analyzed": 173800,
      "iun_with_send_analog": 159709,
      "iun_with_completely_unreachable": 13778,
      "found_in_paper_request_error": 313,
      "total_results": 173800,
      "resolved_cases": 0,
      "new_cases": 0,
      "total_open_cases": 0,
      "previous_open_cases": 0,
      "full_analysis_mode": false
    }
  ]
}
```

**Metriche principali**:
- `total_iun_analyzed`: Totale IUN analizzati nell'esecuzione
- `iun_with_send_analog`: IUN che hanno ricevuto SEND_ANALOG_DOMICILE
- `iun_with_completely_unreachable`: IUN che hanno ricevuto COMPLETELY_UNREACHABLE
- `found_in_paper_request_error`: Numero di requestId trovati nella tabella DynamoDB PaperRequestError (informativo)
- `total_results`: Somma di verifica (send_analog + completely_unreachable + paper_error = total_analyzed)
- `resolved_cases`: Casi problematici risolti dall'ultima esecuzione
- `new_cases`: Nuovi casi problematici trovati
- `total_open_cases`: Totale casi problematici ancora aperti (hasResult=false E NON in PaperRequestError)
- `previous_open_cases`: Casi problematici dell'esecuzione precedente

**Comportamento timeout:**
- Se l'esecuzione supera i 14 minuti, salva automaticamente i progressi
- Al prossimo giro riprende esattamente da dove si era fermato (usando `last_update`)
- Non ci sono gap o sovrapposizioni nei dati analizzati

## Note

- Lo script utilizza la tabella `pn_timelines_json_view` su Athena di default
- **Tutti gli orari sono in UTC**: I timestamp nei file JSON (`statistics.json`, `prepare_analog_domicile_latest.json`) e nei parametri della query sono sempre in UTC
- I risultati vengono ordinati per timestamp in ordine decrescente
- I parametri `--profile` e `--output-location` sono obbligatori
- **Salvataggio risultati**:
  - **Locale** (default): I file JSON vengono salvati nella cartella `result/` nello stesso path dello script
  - **S3** (con `--s3-result-bucket`): I file `prepare_analog_domicile_latest.json` e `statistics.json` vengono salvati sul bucket S3 specificato
- Il file CSV completo viene sempre salvato nella location S3 specificata da `--output-location`
- **Esecuzione incrementale**: Usa `statistics.json` (locale o S3) per riprendere automaticamente da dove si è fermato
- **Exit codes**: 0 = successo, 2 = timeout raggiunto, 130 = interrotto dall'utente
- **Permessi S3 richiesti**: Se usi `--s3-result-bucket`, assicurati che il profilo AWS abbia permessi `s3:GetObject` e `s3:PutObject` sul bucket
