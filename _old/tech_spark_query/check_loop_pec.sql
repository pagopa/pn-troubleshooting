CREATE or replace temporary view timeline
USING org.apache.spark.sql.parquet
OPTIONS (
  path "s3a://${PARQUET_BUCKET}/parquet/pn-Timelines/"
);


WITH RecentProgressIUNs AS (
    -- Trova gli iun che hanno SEND_DIGITAL_PROGRESS negli ultimi 3 giorni
    SELECT DISTINCT 
        REGEXP_REPLACE(
        REGEXP_REPLACE(timelineElementId, '^DIGITAL_PROG\.', ''),
        '\.IDX_[0-9]+$', '') AS cleaned_timelineId
    FROM timeline
    WHERE category = 'SEND_DIGITAL_PROGRESS'
      AND CAST(timestamp AS TIMESTAMP) > date_sub(current_date(), 3)
),
FeedbackOlderThanDate AS (
    -- Trova gli iun che hanno SEND_DIGITAL_FEEDBACK precedente a 15 giorni
    SELECT DISTINCT 
        REGEXP_REPLACE(timelineElementId, '^SEND_DIGITAL_FEEDBACK\.', '') AS cleaned_timelineId
    FROM timeline
    WHERE category = 'SEND_DIGITAL_FEEDBACK'
      AND CAST(timestamp AS TIMESTAMP) < date_sub(current_date(), 15)
),
FilteredIUNs AS (
    -- Intersezione dei due insiemi
    SELECT 
        rpi.cleaned_timelineId
    FROM RecentProgressIUNs rpi
    INNER JOIN FeedbackOlderThanDate fof
        ON rpi.cleaned_timelineId = fof.cleaned_timelineId
)
-- Risultato finale
SELECT REGEXP_EXTRACT(cleaned_timelineId, 'IUN_([A-Z0-9\\-]+)', 1) AS extracted_iun
FROM FilteredIUNs;