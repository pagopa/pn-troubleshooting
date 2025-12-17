# paper-tracker-check-dryrun

Script per verificare la corrispondenza tra gli eventi analogici della timeline e gli output dry-run di pn-paper-tracker.

```
Uso:
  CORE_AWS_PROFILE=sso_pn-core-dev REGION=eu-south-1 INPUT_FILE=./input.csv node index.js

Variabili d'ambiente:
  - CORE_AWS_PROFILE: profilo AWS da usare
  - REGION: regione AWS (default: eu-south-1)
  - INPUT_FILE: percorso del file csv conteneente gli attemptId da controllare (default: ./input.csv)
  - SAVE_JSON: se impostato a "true", salva i file json di output della timeline, dry-run ed il confronto

Output:
  - out/report.csv: report csv con eventuali errori di tracking
  - out/timeline_<attemptId>.json: elementi della timeline letti da DynamoDB
  - out/dryrun_<attemptId>.json: output dry run letti da DynamoDB
  - out/trackingErrors_<attemptId>.json: output dry run letti da DynamoDB
  - out/comparison_<attemptId>.json: report di confronto tra timeline e dry run
```

## Struttura file CSV
```CSV
"IUN","attemptId","trackingId","registeredLetterCode","lastStatusCode","finalStatusCode","productType","finalEventBuilderTimestamp","state","deliveryFailureCause","unifiedDeliveryDriver","ocrEnabled","errorCategory","errorMessage","errorCause","errorEventId","errorEventStatusCode","errorflowThrow","errorType","errorCreatedTimestamp"
```

## Query Athena
```SQL
WITH trackings AS (
	SELECT *,
		ROW_NUMBER() OVER (
			PARTITION BY trackingId
			ORDER BY updatedAt DESC
		) AS rn,
		regexp_extract(trackingId, 'IUN_([^.]+)', 1) AS IUN,
		element_at(events, cardinality(events)).statusCode AS lastStatusCode
	FROM "pn_paper_trackings_json_view"
	WHERE p_year = '2025'
		AND (
			(
				p_month = '12'
				AND CAST(p_day AS INT) BETWEEN 9 AND 9
			)
		)
),
errors AS (
	SELECT *
	FROM "pn_paper_trackings_errors_json_view"
	WHERE p_year = '2025'
		AND (
			(
				p_month = '12'
				AND CAST(p_day AS INT) BETWEEN 9 AND 9
			)
		)
),
latest_trackings AS (
	SELECT *
	FROM trackings
	WHERE rn = 1
		AND lastStatusCode IN (
			'RECRN006',
			'RECRN013',
			'RECRN001C',
			'RECRN002C',
			'RECRN002F',
			'RECRN003C',
			'RECRN004C',
			'RECRN005C',
			'RECRI005',
			'RECRI003C',
			'RECRI004C',
			'RECAG002C',
			'RECAG003C',
			'RECAG001C',
			'RECAG003F',
			'RECAG004',
			'RECAG013',
			'RECAG005C',
			'RECAG006C',
			'RECAG007C',
			'RECAG008C',
      'CON996'
		)
		AND (
			state = 'KO'
			OR state = 'DONE'
		)
),
trackings_with_errors AS (
	SELECT latest_trackings.*,
		errors.category AS errorCategory,
		errors.details_message AS errorMessage,
		errors.details_cause AS errorCause,
		errors.eventIdThrow AS errorEventId,
		errors.eventThrow AS errorEventStatusCode,
		errors.flowThrow AS errorflowThrow,
		errors.type AS errorType,
		errors.created AS errorCreatedTimestamp
	FROM latest_trackings
		LEFT JOIN errors ON latest_trackings.trackingId = errors.trackingId
)
SELECT IUN,
	attemptId,
	trackingId,
	createdAt AS trackingCreatedTimestamp,
	paperStatus_registeredLetterCode AS registeredLetterCode,
	lastStatusCode,
	paperStatus_finalStatusCode AS finalStatusCode,
	productType,
	validationFlow_finalEventBuilderTimestamp AS finalEventBuilderTimestamp,
	state,
	paperStatus_deliveryFailureCause AS deliveryFailureCause,
	unifiedDeliveryDriver,
	validationConfig_ocrEnabled AS ocrEnabled,
	errorCategory,
	errorMessage,
	errorCause,
	errorEventId,
	errorEventStatusCode,
	errorflowThrow,
	errorType,
	errorCreatedTimestamp
FROM trackings_with_errors;
```