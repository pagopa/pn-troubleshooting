
-----------------------------------------------------------------------------------------------
-- 010__all_paper_metadata_with_synthetic_select_list

create or replace temporary view all_paper_metadata_with_synthetic_select_list as
  SELECT
    requestTimestamp,
    papeprMeta_productType,
    array_join(transform(
      array_sort(
        event_list,
        (e1,e2) -> CASE WHEN e1.paperProg_statusDateTime IS NULL and e2.paperProg_statusDateTime IS NULL THEN 0
                        WHEN e2.paperProg_statusDateTime IS NULL THEN -1
                        WHEN e1.paperProg_statusDateTime IS NULL THEN 1
                        WHEN e2.paperProg_statusDateTime < e1.paperProg_statusDateTime THEN 1
                        WHEN e2.paperProg_statusDateTime > e1.paperProg_statusDateTime THEN -1
                        ELSE 0
                   END
      ),
      e -> e.paperProg_statusCode
    ), ' ')
     as statuses_string,
    requestId
  FROM
    ec_metadta__fromfile
  WHERE
    papeprMeta_productType is not null
;


----------------------------------------------------------------------------------------------
-- 020__cardinality_by_product_and_sequence

create or replace temporary view cardinality_by_product_and_sequence as
  SELECT
    papeprMeta_productType,
    statuses_string,
    count(requestId) as cardinality,
    min(requestTimestamp) as oldest_with_this_sequence,
    from_unixtime(percentile(
      unix_timestamp( coalesce( timestamp(requestTimestamp), date(requestTimestamp) )),
      0.01
    ))
     as oldest_one_percent,
    from_unixtime(percentile(
      unix_timestamp( coalesce( timestamp(requestTimestamp), date(requestTimestamp) )),
      0.1
    ))
     as oldest_ten_percent,
    from_unixtime(percentile(
      unix_timestamp( coalesce( timestamp(requestTimestamp), date(requestTimestamp) )),
      0.25
    ))
     as oldest_quartile,
    from_unixtime(percentile(
      unix_timestamp( coalesce( timestamp(requestTimestamp), date(requestTimestamp) )),
      0.5
    ))
     as median,
    from_unixtime(percentile(
      unix_timestamp( coalesce( timestamp(requestTimestamp), date(requestTimestamp) )),
      0.75
    ))
     as newst_quartile,
    from_unixtime(percentile(
      unix_timestamp( coalesce( timestamp(requestTimestamp), date(requestTimestamp) )),
      0.9
    ))
     as newest_ten_percent,
    from_unixtime(percentile(
      unix_timestamp( coalesce( timestamp(requestTimestamp), date(requestTimestamp) )),
      0.99
    ))
     as newest_one_percent,
    max(requestTimestamp) as newest_with_this_sequence
  FROM
    all_paper_metadata_with_synthetic_select_list
  GROUP BY
    papeprMeta_productType,
    statuses_string
  ORDER BY
    papeprMeta_productType,
    statuses_string
;

----------------------------------------------------------------------------------------------
-- 030__cardinality_by_product_and_day

create or replace temporary view cardinality_by_product_and_day as
  SELECT
    papeprMeta_productType,
    date(requestTimestamp) as day,
    count(requestId) as cardinality
  FROM
    all_paper_metadata_with_synthetic_select_list
  GROUP BY
    papeprMeta_productType,
    day
  ORDER BY
    papeprMeta_productType,
    day
;
