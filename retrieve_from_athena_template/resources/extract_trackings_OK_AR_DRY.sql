-- Query per estrarre i tracking con gli errori associati per i prodotti AR, RIR, RS, RIS in DRY
	SELECT *,
		ROW_NUMBER() OVER (
			PARTITION BY trackingId
			ORDER BY updatedAt DESC
		) AS rn
	FROM "pn_paper_trackings_json_view"
	-- WHERE p_year = '2026'
	-- 	AND (
	-- 		p_month = '02'
	-- 		AND CAST(p_day AS INT) BETWEEN 9 AND 15
	-- 	)
    WHERE <QUERY_CONDITION_Q1>
),
errors AS (
	SELECT *
	FROM "pn_paper_trackings_errors_json_view"
	-- WHERE p_year = '2026'
	-- 	AND (
	-- 		p_month = '02'
	-- 		AND CAST(p_day AS INT) BETWEEN 9 AND 15
	-- 	)
    WHERE <QUERY_CONDITION_Q1>
),
latest_trackings AS (
  SELECT *
  FROM trackings
  WHERE rn = 1
),
trackings_with_erros AS (
	SELECT latest_trackings.*,
	    errors.trackingId AS errorTrackingId,
		errors.category AS errorCategory,
		errors.details_message AS errorMessage,
		errors.details_cause AS errorCause,
		errors.eventIdThrow AS errorEventId,
		errors.eventThrow AS errorEventStatusCode,
		errors.flowThrow AS errorflowThrow,
		errors.type AS errorType,
		errors.created AS errorCreatedTimestamp,
		-- TODO: errors.details_additionalDetails AS errorAdditionalDetails,
		if(
            element_at(filter(latest_trackings.events, e -> e.statusCode = 'P000'), 1).dryRun,
            'DRY',
            'RUN'
        ) AS processingMode
    FROM latest_trackings
    LEFT JOIN errors 
      ON latest_trackings.trackingId = errors.trackingId
),
final_status_codes AS (
  SELECT ARRAY[
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
    'RECRS001C',
    'RECRS002C',
    'RECRS002F',
    'RECRS003C',
    'RECRS004C',
    'RECRS005C',
    'RECRS006',
    'RECRS013',
    'RECRSI003C',
    'RECRSI004C',
    'RECRSI005'
  ] AS codes
),
filtered_trackings AS (
    SELECT *,
        cardinality(
          array_distinct(
            transform(
              filter(
                events,
                e -> contains(codes, e.statusCode)
              ),
              e -> e.id
            )
          )
        ) AS multipleFinalEvents
    FROM trackings_with_erros, final_status_codes
    WHERE ( state = 'DONE' AND businessState = 'DONE')
      AND processingMode IN ('DRY', '')
      AND productType IN ('AR', 'RIR', 'RS', 'RIS')
)
SELECT
  regexp_extract(trackingId, 'IUN_([^.]+)', 1) AS IUN,
  attemptId,
	trackingId,
	createdAt AS trackingCreatedTimestamp,
	productType,
	unifiedDeliveryDriver,
	element_at(filter(events, e -> starts_with(e.statusCode, 'CON')), 1).registeredLetterCode AS registeredLetterCode,
	processingMode,
	element_at(events, cardinality(events)).statusCode AS lastStatusCode,
	validationFlow_finalEventBuilderTimestamp AS finalEventBuilderTimestamp,
	state as refinementState,
	businessState,
	paperStatus_deliveryFailureCause AS deliveryFailureCause,
	validationConfig_ocrEnabled AS ocrEnabled,
	multipleFinalEvents,
	errorCategory,
	errorMessage,
	errorCause,
	-- TODO: errorAdditionalDetails
	errorEventId,
	errorEventStatusCode,
	errorflowThrow,
	errorType,
	errorCreatedTimestamp
FROM filtered_trackings
ORDER BY trackingId;