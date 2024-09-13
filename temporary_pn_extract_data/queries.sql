CREATE OR REPLACE TEMPORARY VIEW timeline
USING org.apache.spark.sql.parquet
OPTIONS (
  path 's3a://pn-datamonitoring-eu-south-1-510769970275/parquet/pn-Timelines/'
);

SELECT 
    EXTRACT(YEAR FROM timestamp) AS anno, 
    COUNT(iun) AS numero_iun
FROM 
    timeline
WHERE 
    category = 'NOTIFICATION_VIEWED'
    AND EXTRACT(YEAR FROM timestamp) IN (2023, 2024)
GROUP BY 
    anno
ORDER BY 
    anno;
