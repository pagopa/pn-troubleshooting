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
        ) AS processingMode
    FROM errors
    LEFT JOIN latest_trackings 
      ON latest_trackings.trackingId = errors.trackingId
),
filtered_errors AS (
    SELECT *
    FROM errors_with_trackings
    WHERE ( state = 'KO' OR businessState = 'KO') -- Prendo tutte le spedizioni in KO
        AND unifiedDeliveryDriver = <QUERY_CONDITION_Q2>
        -- AND unifiedDeliveryDriver = 'Fulmine'
        AND processingMode = 'RUN'
        -- AND (
        --     (errorCategory = 'INCONSISTENT_STATE' AND errorCause = 'VALUES_NOT_FOUND') OR
        --     (errorCategory = 'INCONSISTENT_STATE' AND errorCause = 'STOCK_890_REFINEMENT_ERROR') OR
        --     (errorCategory = 'INCONSISTENT_STATE' AND errorCause = 'STOCK_890_REFINEMENT_MISSING') OR
        --     (errorCategory = 'RENDICONTAZIONE_SCARTATA' AND errorCause = 'GIACENZA_DATE_ERROR') OR
        --     (errorCategory = 'DATE_ERROR' AND errorCause = 'VALUES_NOT_MATCHING') OR
        --     (errorCategory = 'DATE_ERROR' AND errorCause = 'INVALID_VALUES') OR
        --     (errorCategory = 'REGISTERED_LETTER_CODE_ERROR' AND errorCause = 'VALUES_NOT_MATCHING') OR
        --     (errorCategory = 'REGISTERED_LETTER_CODE_ERROR' AND errorCause = 'INVALID_VALUES') OR
        --     (errorCategory = 'DELIVERY_FAILURE_CAUSE_ERROR' AND errorCause = 'VALUES_NOT_MATCHING') OR
        --     (errorCategory = 'ATTACHMENTS_ERROR' AND errorCause = 'VALUES_NOT_MATCHING') OR
        --     (errorCategory = 'ATTACHMENTS_ERROR' AND errorCause = 'INVALID_VALUES') OR
        --     (errorCategory = 'OCR_VALIDATION' AND errorCause = 'OCR_KO')
        -- )
        AND (
            errorCategory = 'STATUS_CODE_ERROR' OR
            errorCategory = 'DATE_ERROR' OR
            errorCategory = 'INCONSISTENT_STATE'OR
            errorCategory = 'RENDICONTAZIONE_SCARTATA' OR
            errorCategory = 'REGISTERED_LETTER_CODE_ERROR' OR
            errorCategory = 'REGISTERED_LETTER_CODE_NOT_FOUND' OR
            errorCategory = 'DELIVERY_FAILURE_CAUSE_ERROR' OR
            errorCategory = 'ATTACHMENTS_ERROR' OR
            errorCategory = 'INVALID_STATE_FOR_STOCK_890'
        )
)
SELECT
	errorTrackingId AS requestId,
	element_at(filter(events, e -> e.statusCode = 'P000'), 1).statusTimestamp AS requestTimestamp,
	errorProductType AS prodotto,
	unifiedDeliveryDriver AS recapitista_unif,
	element_at(filter(events, e -> starts_with(e.statusCode, 'CON')), 1).registeredLetterCode AS codice_oggetto,
	concat('''', element_at(filter(events, e -> starts_with(e.statusCode, 'CON')), 1).registeredLetterCode) AS codiceOggetto,
	coalesce(
        element_at(filter(events, e -> e.statusCode = 'CON018'), 1).statusTimestamp,
        element_at(filter(events, e -> e.statusCode = 'CON016'), 1).statusTimestamp,
        element_at(filter(events, e -> e.statusCode = 'P000'), 1).statusTimestamp
    ) AS affido_accettazione_rec_data,
	errorCategory,
	errorMessage,
	errorCause,
	errorType,
	errorCreatedTimestamp
	-- TODO: errorAdditionalDetails,
FROM filtered_errors
ORDER BY errorCreatedTimestamp;