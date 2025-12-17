WITH trackings AS (
	SELECT *,
		ROW_NUMBER() OVER (
			PARTITION BY trackingId
			ORDER BY updatedAt DESC
		) AS rn,
		regexp_extract(trackingId, 'IUN_([^.]+)', 1) AS IUN,
		element_at(events, cardinality(events)).statusCode AS lastStatusCode
	FROM "pn_paper_trackings_json_view"
	WHERE <QUERY_CONDITION_Q1>
),
errors AS (
	SELECT *
	FROM "pn_paper_trackings_errors_json_view"
	WHERE <QUERY_CONDITION_Q1>
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
			'RECAG008C'
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