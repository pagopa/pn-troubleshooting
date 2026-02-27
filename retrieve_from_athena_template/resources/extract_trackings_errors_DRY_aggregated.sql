-- Query per estrarre gli errori delle spedizoini in DRY

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
    WHERE processingMode IN ('DRY', '')
),
aggregated AS (
    SELECT
        errorCategory,
        errorCause,
        errorType,
        errorProductType,
        unifiedDeliveryDriver,
        COUNT(*) AS cnt
    FROM filtered_errors
    GROUP BY errorCategory, errorCause, errorType, errorProductType, unifiedDeliveryDriver
)
SELECT
    errorCategory,
    errorCause,
    errorType,
    errorProductType,
    SUM(cnt) AS numero_errori,
    map_agg(unifiedDeliveryDriver, cnt) AS errori_per_recapitista
FROM aggregated
GROUP BY errorCategory, errorCause, errorType, errorProductType
ORDER BY numero_errori DESC;