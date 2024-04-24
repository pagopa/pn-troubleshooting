-----------------------------------------------------------------------------------------------
-- ec_metadata__fromfile
CREATE OR REPLACE temporary view ec_metadata__fromfile
USING org.apache.spark.sql.parquet
OPTIONS (
  path "s3a://pn-datamonitoring-eu-south-1-350578575906/parquet/pn-EcRichiesteMetadati/",
  "parquet.enableVectorizedReader" "false"
)
;

-----------------------------------------------------------------------------------------------
-- incremental_notification
CREATE OR REPLACE temporary view incremental_notification
USING org.apache.spark.sql.parquet
OPTIONS (
  path "s3a://pn-datamonitoring-eu-south-1-510769970275/parquet/pn-Notifications/",
  "parquet.enableVectorizedReader" "false"
)
;

-----------------------------------------------------------------------------------------------
-- incremental_timeline
CREATE OR REPLACE temporary view incremental_timeline
USING org.apache.spark.sql.parquet
OPTIONS (
  path "s3a://pn-datamonitoring-eu-south-1-510769970275/parquet/pn-Timelines/",
  "parquet.enableVectorizedReader" "false"
)
;

-----------------------------------------------------------------------------------------------
-- matrice_costi
CREATE OR REPLACE TEMPORARY VIEW matrice_costi
USING csv
OPTIONS (
  path "s3a://pn-datamonitoring-eu-south-1-510769970275/external/matrice_costi_2023_pivot.csv.gz",
  header true
)
;


-----------------------------------------------------------------------------------------------
-- 010__complete_updated_ec_metadata

create or replace temporary view complete_updated_ec_metadata as
  WITH
    last_modification_by_request_id AS (
      select
        e.requestId,
        max( coalesce( cast(e.Metadata_WriteTimestampMicros as long), 0) ) as ts
      from
        ec_metadata__fromfile e
	  WHERE
	  	paperMeta_productType is not null
      group by
        e.requestId
    ),
    ec_metadata_last_update AS (
      SELECT
          l.ts,
          e.*,
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  e.requestId,
                  '[^~]*~',
                  ''
                ),
                'PREPARE_ANALOG',
                'SEND_ANALOG'
              ),
              'PREPARE_SIMPLE_',
              'SEND_SIMPLE_'
            ),
            '(\\.)?PCRETRY_[0-9]+',
            ''
          ) as timelineElementId_computed
        FROM
          last_modification_by_request_id l
          LEFT JOIN ec_metadata__fromfile e
                 ON e.requestId = l.requestId
                    and l.ts = coalesce( cast(e.Metadata_WriteTimestampMicros as long), 0)
    ),
    ecmetadata_with_timeline AS (
      SELECT
        e.requestid AS paper_request_id,
        t.iun AS iun,
        t.timelineElementId AS timelineElementId,
        named_struct (
          'timeline_zip', get_json_object( t.details, '$.physicalAddress.M.zip.S'),
          'timeline_state', get_json_object( t.details, '$.physicalAddress.M.foreignState.S'),
          'paid', t.paid
        )
         AS semplified_timeline_details,
        struct(
          e.*
        )
         as ec_metadata
      from
        ec_metadata_last_update e
        left join incremental_timeline t on e.timelineElementId_computed = t.timelineElementId
      where
        e.paperMeta_productType is not null
    ),
    ecmetadata_with_timeline_and_costi AS (
      select
        et.*,
        named_struct (
          'recapitista', c.recapitista,
          'lotto', c.lotto
        )
         as costi_recapito
      from
        ecmetadata_with_timeline et
        left join matrice_costi c on
            et.ec_metadata.paperMeta_productType = c.product
          and
            c.geokey =
            (
              case
                when et.ec_metadata.paperMeta_productType in ('AR', 'RS', '890') then et.semplified_timeline_details.timeline_zip
                when et.ec_metadata.paperMeta_productType in ('RIS', 'RIR') then et.semplified_timeline_details.timeline_state
                else null
              end
            )
          and
            c.min = 1
    )
select
    *
FROM
    ecmetadata_with_timeline_and_costi
where
    timelineElementId is not NULL
;

-----------------------------------------------------------------------------------------------
-- 020__events

create or replace temporary view events as
	WITH all_events AS (
		SELECT
			paper_request_id AS requestId,
			costi_recapito.recapitista AS shipper,
			ec_metadata.paperMeta_productType as product,
			e.paperProg_status as status,
			e.paperProg_statusDateTime as statusDateTime
		FROM complete_updated_ec_metadata c LATERAL VIEW EXPLODE(c.ec_metadata.event_list) as e
		WHERE ec_metadata.paperMeta_productType IN ('890', 'AR', 'RS')
	), all_events_ranked AS (
		SELECT DISTINCT requestId, shipper, product, status, max(statusDateTime) over(PARTITION BY requestId, status)
		FROM all_events e
		WHERE e.status RLIKE("(CON016)|(REC.*)")
	), events_grouped AS (
		SELECT r.shipper, r.product, r.status, COUNT(*) AS _count
		FROM all_events_ranked r
		GROUP BY r.shipper, r.product, r.status
	), events_pivoted AS (
		SELECT * FROM events_grouped
		PIVOT
		(
			first(_count)
			FOR status IN (
				'CON016',
				'RECRN001A', 'RECRN002A', 'RECRN003A', 'RECRN004A', 'RECRN005A', 'RECRN001C', 'RECRN002C', 'RECRN003C', 'RECRN004C', 'RECRN005C', 'RECRN002D', 'RECRN002F', 'RECRN006', 'RECRN010', 'RECRN013',
				'RECAG001A', 'RECAG002A', 'RECAG003A', 'RECAG005A', 'RECAG006A', 'RECAG007A', 'RECAG008A', 'RECAG001C', 'RECAG002C', 'RECAG003C', 'RECAG005C', 'RECAG006C', 'RECAG007C', 'RECAG008C', 'RECAG003D', 'RECAG003F', 'RECAG004', 'RECAG010', 'RECAG013',
				'RECRS002A', 'RECRS004A', 'RECRS005A', 'RECRS001C', 'RECRS002C', 'RECRS003C', 'RECRS004C', 'RECRS005C', 'RECRS002D', 'RECRS002F', 'RECRS006', 'RECRS010', 'RECRS013'
			)
		)
	)
SELECT * FROM events_pivoted
;

-----------------------------------------------------------------------------------------------
-- 030__product890

CREATE OR replace TEMPORARY VIEW product890 AS
	WITH product890PartialKpis AS (
		SELECT
			e.shipper,
			e.product,
			COALESCE(e.CON016, 0) AS PreseInCarico,
			COALESCE(e.RECAG001A, 0) + COALESCE(e.RECAG002A, 0) AS Consegnate,
			(COALESCE(e.RECAG001C, 0) + COALESCE(e.RECAG002C, 0)) / (COALESCE(e.RECAG001A, 0) + COALESCE(e.RECAG002A, 0)) AS PercentualeDematConsegnate,
			COALESCE(e.RECAG003A, 0) AS MancatoRecapito,
			COALESCE(e.RECAG003C, 0) / COALESCE(e.RECAG003A, 0) AS PercentualeDematMancatoRecapito,
			COALESCE(e.RECAG003D, 0) AS Irreperibile,
			COALESCE(e.RECAG003F, 0) / COALESCE(e.RECAG003D, 0) AS PercentualeDematIrreperibile,
			COALESCE(e.RECAG010, 0) AS InviateInGiacenza,
			COALESCE(e.RECAG005A, 0) + COALESCE(e.RECAG005A, 0) AS ConsegnateInGiacenza,
			(COALESCE(e.RECAG005C, 0) + COALESCE(e.RECAG006C, 0)) / (COALESCE(e.RECAG005A, 0) + COALESCE(e.RECAG006A, 0)) AS PercentualeDematConsegnateInGiacenza,
			COALESCE(e.RECAG007A, 0) + COALESCE(e.RECAG008A, 0) AS MancataCompiutaGiacenza,
			(COALESCE(e.RECAG007C, 0) + COALESCE(e.RECAG008C, 0)) / (COALESCE(e.RECAG007A, 0) + COALESCE(e.RECAG008A, 0)) AS PercentualeDematMancataCompiutaGiacenza,
			COALESCE(e.RECAG004, 0) + COALESCE(e.RECAG013, 0) AS NonRendicontabili
		FROM events e
		WHERE e.product = "890"
	), product890Kpis AS (
		SELECT
			p.*,
			p.PreseInCarico - (p.Consegnate + p.MancatoRecapito + p.Irreperibile + p.InviateInGiacenza + p.NonRendicontabili) AS NonInviati
		FROM product890PartialKpis p
	)
SELECT * FROM product890Kpis
;

-----------------------------------------------------------------------------------------------
-- 040__productAR

CREATE OR replace TEMPORARY VIEW productAR AS
	WITH productARPartialKpis AS (
		SELECT
			e.shipper,
			e.product,
			COALESCE(e.CON016, 0) AS PreseInCarico,
			COALESCE(e.RECRN001A, 0) AS Consegnate,
			COALESCE(e.RECRN001C, 0) / COALESCE(e.RECRN001A, 0) AS PercentualeDematConsegnate,
			COALESCE(e.RECRN002A, 0) AS MancatoRecapito,
			COALESCE(e.RECRN002C, 0) / COALESCE(e.RECRN002A, 0) AS PercentualeDematMancatoRecapito,
			COALESCE(e.RECRN002D, 0) AS Irreperibile,
			COALESCE(e.RECRN002F, 0) / COALESCE(e.RECRN002D, 0) AS PercentualeDematIrreperibile,
			COALESCE(e.RECRN010, 0) AS InviateInGiacenza,
			COALESCE(e.RECRN003A, 0) AS ConsegnateInGiacenza,
			COALESCE(e.RECRN003C, 0) / COALESCE(e.RECRN003A, 0) AS PercentualeDematConsegnateInGiacenza,
			COALESCE(e.RECRN004A, 0) + COALESCE(e.RECRN005A, 0) AS MancataCompiutaGiacenza,
			(COALESCE(e.RECRN004C, 0) + COALESCE(e.RECRN005C, 0)) / (COALESCE(e.RECRN004A, 0) + COALESCE(e.RECRN005A, 0)) AS PercentualeDematMancataCompiutaGiacenza,
			COALESCE(e.RECRN006, 0) + COALESCE(e.RECRN013, 0) AS NonRendicontabili
		FROM events e
		WHERE e.product = "AR"
	), productARKpis AS (
		SELECT
			p.*,
			p.PreseInCarico - (p.Consegnate + p.MancatoRecapito + p.Irreperibile + p.InviateInGiacenza + p.NonRendicontabili) AS NonInviati
		FROM productARPartialKpis p
	)
SELECT * FROM productARKpis
;

-----------------------------------------------------------------------------------------------
-- 050__productRS

CREATE OR replace TEMPORARY VIEW productRS AS
	WITH productRSPartialKpis AS (
		SELECT
			e.shipper,
			e.product,
			COALESCE(e.CON016, 0) AS PreseInCarico,
			COALESCE(e.RECRS001C, 0) AS Consegnate,
			"NA" AS PercentualeDematConsegnate,
			COALESCE(e.RECRS002A, 0) AS MancatoRecapito,
			COALESCE(e.RECRS002C, 0) / COALESCE(e.RECRS002A, 0) AS PercentualeDematMancatoRecapito,
			COALESCE(e.RECRS002D, 0) AS Irreperibile,
			COALESCE(e.RECRS002F, 0) / COALESCE(e.RECRS002D, 0) AS PercentualeDematIrreperibile,
			COALESCE(e.RECRS010, 0) AS InviateInGiacenza,
			COALESCE(e.RECRS003C, 0) AS ConsegnateInGiacenza,
			"NA" AS PercentualeDematConsegnateInGiacenza,
			COALESCE(e.RECRS004A, 0) + COALESCE(e.RECRS005A, 0) AS MancataCompiutaGiacenza,
			(COALESCE(e.RECRS004C, 0) + COALESCE(e.RECRS005C, 0)) / (COALESCE(e.RECRS004A, 0) + COALESCE(e.RECRS005A, 0)) AS PercentualeDematMancataCompiutaGiacenza,
			COALESCE(e.RECRS006, 0) + COALESCE(e.RECRS013, 0) AS NonRendicontabili
		FROM events e
		WHERE e.product = "RS"
	), productRSKpis AS (
		SELECT
			p.*,
			p.PreseInCarico - (p.Consegnate + p.MancatoRecapito + p.Irreperibile + p.InviateInGiacenza + p.NonRendicontabili) AS NonInviati
		FROM productRSPartialKpis p
	)
SELECT * FROM productRSKpis
;

-----------------------------------------------------------------------------------------------
-- 060__shipper_reliability_report

SELECT * FROM product890 p890
UNION ALL
SELECT * FROM productAR pAR
UNION ALL
SELECT * FROM productRS pRS
;