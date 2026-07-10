# opensearch_audit_extraction

Script per estrarre KPI audit da OpenSearch tramite chiamate HTTP `/_search` e produrre report Excel.

## Tabella dei Contenuti

- [Descrizione](#descrizione)
- [Installazione](#installazione)
- [Utilizzo](#utilizzo)
- [Output](#output)

## Descrizione

Lo script esegue query aggregate su OpenSearch e genera report Excel per analisi KPI.

In particolare:
- usa un intervallo temporale UTC fisso:
	- `startDate`: giorno 16 del mese precedente alle `23:59:59`
	- `endDate`: giorno 17 del mese corrente alle `00:00:00`
	- filtro: `@timestamp >= startDate` e `@timestamp < endDate`
- interroga i log group `/aws/ecs/pn-delivery` e `/aws/ecs/pn-mandate`;
- calcola i KPI:
	- `KP1 - Accessi Generali`
	- `KP1 - Delegati Ripetuti`
	- `KP2 - Tasso Successo`
	- `KP3 - Distribuzione Deleghe`
	- `KP3 - Sospetto Fallimenti`
	- `KP3 - Sospetto per Soggetto`
	- `KP6 - Errori Validazione`
	- `Top Delegati`

## Installazione

```bash
npm install
```

Se il package non contiene dipendenze già dichiarate, installare:

```bash
npm install dotenv exceljs
```

## Utilizzo
### Step preliminare

Se usi profili AWS SSO:

```bash
aws sso login --profile <profile>
```

Configurare il file `.env` nella directory dello script:

```env
BASE_URL=https://localhost:5601
OPENSEARCH_INDEX_PATTERN=pn-logs*
LOG_GROUP_FIELD=logGroup
MESSAGE_FIELD=message
USERNAME=
AGENT=false
OPENSEARCH_TIMEOUT_MS=120000
```

Significato principali variabili:
- `BASE_URL`: endpoint OpenSearch (o tunnel locale)
- `OPENSEARCH_INDEX_PATTERN`: pattern indice usato in `/_search`
- `LOG_GROUP_FIELD`: campo log group (default `logGroup`)
- `MESSAGE_FIELD`: campo message (default `message`)
- `USERNAME`: opzionale, per Basic Auth (la password viene richiesta a runtime)
- `AGENT=false`: disabilita verifica TLS del certificato
- `OPENSEARCH_TIMEOUT_MS`: timeout HTTP in millisecondi

Se `USERNAME` e valorizzato, lo script richiede la password in input nel terminale con prompt nascosto.

### Esecuzione

```bash
node index.js <awsProfile>
```

Dove:
- `<awsProfile>` è opzionale e viene usato per valorizzare `AWS_PROFILE`.

Esempio:

```bash
node index.js sso_pn-core-prod
```

## Output

Lo script genera un file Excel con nome:

```text
Report_KPI_OpenSearch-<startDateUTC>-<endDateUTC>.xlsx
```

All'interno del file Excel crea un foglio per ogni KPI con dati disponibili.

Esempio:

```text
Report_KPI_OpenSearch-2026-05-16T23-59-59Z-2026-06-17T00-00-00Z.xlsx
```

Note:
- se un KPI non restituisce dati, il relativo foglio non viene creato;
- se nessun KPI restituisce dati, non viene prodotto alcun report utilizzabile.
