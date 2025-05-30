CREATE or replace temporary view documents
USING org.apache.spark.sql.parquet
OPTIONS (
  path "s3a://${PARQUET_BUCKET}/parquet/pn-SsDocumenti/"
);

SELECT documentKey as key, 
	   LPAD(version, 2, '0') as versionId, 
	   documentType_tipoDocumento as documentType, 
	   documentLogicalState as documentStatus, 
	   contentType, 
	   checkSum as checksum, 
	   retentionUntil, 
	   clientShortCode as client_short_code
FROM documents
WHERE documentKey like "%.bin" and lastStatusChangeTimestamp < '2024-02-29T23:59:59';