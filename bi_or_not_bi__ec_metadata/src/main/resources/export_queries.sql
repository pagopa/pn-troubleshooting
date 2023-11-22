
-----------------------------------------------------------------------------------------------
-- 010__all_paper_metadata_with_synthetic_select_list_no_class

create or replace temporary view all_paper_metadata_with_synthetic_select_list_no_class as
  SELECT
    requestTimestamp,
    paperMeta_productType,
    trim(array_join(
      transform(
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
        e -> array_join(array( trim(e.paperProg_statusCode), trim(e.paperProg_deliveryFailureCause)), '_')
      ),
      ' '
    ))
     as statuses_string,
    if (
      statuses_string = 'P000',
      'accepted',
      if (
        statuses_string rlike '.*(CON993|CON995|CON996|CON997|CON998|P010).*',
        'refused',
        if (
            statuses_string rlike '.*(CON).*'
          and
            not statuses_string rlike '.*(REC).*',
          'printing',
          if (
              statuses_string rlike '.*(RECAG001C|RECAG002C|RECAG003C|RECAG003F|RECAG004|RECAG005C|RECAG006C|RECAG007C|RECAG008C).*'
            or
              statuses_string rlike '.*(RECRS001C|RECRS002C|RECRS002F|RECRS003C|RECRS004C|RECRS005C|RECRS006).*'
            or
              statuses_string rlike '.*(RECAR001C|RECAR002C|RECAR002F|RECAR003C|RECAR004C|RECAR005C|RECAR006).*',
            'done',
            'UNKNOWN'
          )
        )
      )
    )
     as current_stage,
    array_max(
      transform(
        filter(event_list, e -> e.paperProg_statusCode=='P000'),
        e -> e.paperProg_statusDateTime
      )
    )
     as affido_consolidatore_statusDateTime,
    array_max(
      transform(
        filter(event_list, e -> e.paperProg_statusCode=='CON018'),
        e -> e.paperProg_statusDateTime
      )
    )
     as affido_recapitista_statusDateTime,
    array_max(
      transform(
        filter(event_list, e -> e.paperProg_statusCode rlike '(REC.*F)|(REC.*C)|(RECAG012)'),
        e -> e.paperProg_statusDateTime
      )
    )
     as fine_recapito_statusDateTime,
    array_join(
      transform(
        filter(event_list, e -> e.paperProg_statusCode rlike '(REC.*F)|(REC.*C)|(RECAG012)'),
        e -> e.paperProg_statusCode
      ),
      ' '
    )
     as fine_recapito_status,
    array_join(
      array_distinct(
        transform(event_list,e -> e.paperProg_deliveryFailureCause)
      ),
      ' '
    )
      as deliveryFailureCause,
    requestId
  FROM
    ec_metadta__fromfile
  WHERE
    paperMeta_productType is not null
;


-----------------------------------------------------------------------------------------------
-- 020__all_paper_metadata_with_synthetic_select_list

create or replace temporary view all_paper_metadata_with_synthetic_select_list as
  WITH categorized_sequences_no_arr AS (
    SELECT
      product,
      trim(array_join( transform(codes, c-> trim(c)), ' ')) as statuses_string,
      stage
    FROM
      categorized_sequences
  )
  SELECT
    a.requestTimestamp,
    a.paperMeta_productType,
    if ( a.statuses_string = '', 'INFLIGHT', coalesce( c.stage, a.current_stage, 'UNKNOWN' )) as stage,
    a.affido_consolidatore_statusDateTime,
    a.affido_recapitista_statusDateTime,
    a.fine_recapito_statusDateTime,
    a.fine_recapito_status,
    a.deliveryFailureCause,
    a.statuses_string,
    a.requestId
  FROM
    all_paper_metadata_with_synthetic_select_list_no_class a
    LEFT JOIN categorized_sequences_no_arr c ON c.product = a.paperMeta_productType
                                       and c.statuses_string = a.statuses_string
;

----------------------------------------------------------------------------------------------
-- 030__cardinality_by_product_and_sequence

create or replace temporary view cardinality_by_product_and_sequence as
  SELECT
    paperMeta_productType,
    statuses_string,
    array_join(collect_set( stage ), ' ') as stage,
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
    paperMeta_productType,
    statuses_string
  ORDER BY
    paperMeta_productType,
    statuses_string
;

----------------------------------------------------------------------------------------------
-- 040__cardinality_by_product_and_day

create or replace temporary view cardinality_by_product_and_day as
  SELECT
    paperMeta_productType,
    date(requestTimestamp) as day,
    count(requestId) as cardinality
  FROM
    all_paper_metadata_with_synthetic_select_list
  GROUP BY
    paperMeta_productType,
    day
  ORDER BY
    paperMeta_productType,
    day
;
