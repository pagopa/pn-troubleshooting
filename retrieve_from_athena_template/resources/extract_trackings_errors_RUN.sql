-- Query per estrarre gli errori delle spedizoini in RUN, filtrando per recapitista unificato

WITH trackings AS (
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
errors_with_trackings AS (
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
		errors.productType AS errorProductType,
		-- TODO: errors.details_additionalDetails AS errorAdditionalDetails,
		if(
            element_at(filter(latest_trackings.events, e -> e.statusCode = 'P000'), 1).dryRun,
            'DRY',
            'RUN'
        ) AS processingMode,
        -- Scarta eventi dovuti a retry automatici
        transform(events, e -> e.statusCode) AS status_codes,
        reverse(transform(events, e -> e.statusCode)) AS reversed_status_codes
    FROM errors
    LEFT JOIN latest_trackings 
      ON latest_trackings.trackingId = errors.trackingId
),
filtered_errors AS (
    SELECT *
    FROM errors_with_trackings
    WHERE processingMode = 'RUN'
)
SELECT
	errorTrackingId AS requestId,
	element_at(filter(events, e -> e.statusCode = 'P000'), 1).statusTimestamp AS requestTimestamp,
	errorProductType AS productType,
	unifiedDeliveryDriver,
	element_at(filter(events, e -> starts_with(e.statusCode, 'CON')), 1).registeredLetterCode AS codice_oggetto,
	concat('''', element_at(filter(events, e -> starts_with(e.statusCode, 'CON')), 1).registeredLetterCode) AS codiceOggetto,
	coalesce(
        element_at(filter(events, e -> e.statusCode = 'CON018'), 1).statusTimestamp,
        element_at(filter(events, e -> e.statusCode = 'CON016'), 1).statusTimestamp,
        element_at(filter(events, e -> e.statusCode = 'P000'), 1).statusTimestamp
    ) AS affido_accettazione_rec_data,
	processingMode,
	element_at(events, cardinality(events)).statusCode AS lastStatusCode,
	state as refinementState,
	businessState,
	paperStatus_deliveryFailureCause AS deliveryFailureCause,
	validationConfig_ocrEnabled AS ocrEnabled,
	errorCategory,
	errorMessage,
	errorCause,
	-- TODO: errorAdditionalDetails
	errorEventId,
	errorEventStatusCode,
	errorflowThrow,
	errorType,
	errorCreatedTimestamp,
	-- Recupera se il RECAG012 è arrivato dopo il RECAG00xC o se non è mai arrivato
    CASE
        WHEN cardinality(
                    filter(reversed_status_codes, sc -> sc IN ('RECAG005C', 'RECAG006C', 'RECAG007C', 'RECAG008C'))
                 ) > 0
        THEN
            -- Se RECAG012 non esiste -> TRUE
            IF(
                array_position(reversed_status_codes, 'RECAG012') IS NULL,
                TRUE,
                -- Se esiste, confronto le posizioni
                array_position(reversed_status_codes, 'RECAG012')
                <
                array_position(
                    reversed_status_codes,
                    element_at(
                        filter(
                            reversed_status_codes,
                            sc -> sc LIKE 'RECAG00%C'
                        ),
                        1
                    )
                )
            )
        ELSE NULL
    END AS RECAG012_after_final_or_null,
    filter(array_distinct(status_codes), sc -> sc LIKE 'REC%') AS rec_events
FROM filtered_errors
ORDER BY errorCreatedTimestamp ASC;