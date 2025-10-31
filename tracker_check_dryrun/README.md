# paper-tracker-check-dryrun

## Query Athena
```SQL
WITH trackings AS (
    SELECT *
    FROM "pn_paper_trackings_json_view"
    WHERE p_year = '2025'
      AND (
            (p_month = '10' AND CAST(p_day AS INT) BETWEEN 27 AND 31)
         OR (p_month = '11' AND CAST(p_day AS INT) BETWEEN 1 AND 2)
          )
),
latest_trackings AS (
    SELECT
        t.*,
        ROW_NUMBER() OVER (PARTITION BY trackingId ORDER BY updatedAt DESC) AS rn
    FROM trackings t
),
end_state_trackings AS (
    SELECT lt.*
    FROM latest_trackings lt
    WHERE rn = 1 AND (state = 'KO' OR state = 'DONE')
),
trackings_with_iuns AS (
    SELECT
        *,
        regexp_extract(trackingId, 'IUN_([^.]+)', 1) AS IUN
    FROM end_state_trackings
)
SELECT DISTINCT IUN, attemptId, COUNT(*) AS nPcRetry
FROM trackings_with_iuns
GROUP BY IUN, attemptId
LIMIT 10;
```