/*
$QueryMetadata
{
    "name": "010__all_paper_metadata_with_synthetic_select_list_no_class",
    "dependencies": []
}
*/
create or replace temporary view all_paper_metadata_with_synthetic_select_list_no_class as
  WITH
    last_modification_by_request_id AS (
      select
        e.requestId,
        max( coalesce( cast(e.Metadata_WriteTimestampMicros as long), 0) ) as ts
      from
        ec_metadata__fromfile e
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
            '.PCRETRY_[0-9]+',
            ''
          )
           as timelineElementId_computed
        FROM
          last_modification_by_request_id l
          LEFT JOIN ec_metadata__fromfile e
                 ON e.requestId = l.requestId
                    and l.ts = coalesce( cast(e.Metadata_WriteTimestampMicros as long), 0)
    ),
    ec_metadata_last_update_with_timeline AS (
      select
        e.*,
        t.*
      from
        ec_metadata_last_update e
        left join timelines t on e.timelineElementId_computed = t.timelineElementId
    )
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
        e -> trim(e.paperProg_statusCode)
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
    array_join(
        array_distinct(
          flatten(
            transform(
                filter(
                  event_list, 
                  e -> e.paperProg_statusCode rlike '(REC.*B)|(REC.*E)'
                ).paperProg_attachments,
              e -> e.documentType
            )
          )
        ),
      ' ') as attachments,
    requestId,
    timelineElementId,
    category,
    cast( get_json_object( details_str, '$.numberOfPages.N') as integer)  as timeline_num_pages,
    cast( get_json_object( details_str, '$.envelopeWeight.N') as integer) as timeline_weight,
    get_json_object( details_str, '$.physicalAddress.M.zip.S') as timeline_zip,
    get_json_object( details_str, '$.physicalAddress.M.foreignState.S') as timeline_state
  FROM
    ec_metadata_last_update_with_timeline
  WHERE
    paperMeta_productType is not null
;

/*
$QueryMetadata
{
    "name": "020__all_paper_metadata_with_synthetic_select_list",
    "dependencies": []
}
*/
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
    a.requestId,
    a.timelineElementId,
    a.category,
    a.timeline_num_pages,
    a.timeline_weight,
    a.timeline_zip,
    a.timeline_state
  FROM
    all_paper_metadata_with_synthetic_select_list_no_class a
    LEFT JOIN categorized_sequences_no_arr c ON c.product = a.paperMeta_productType
                                       and c.statuses_string = a.statuses_string
;

/*
$QueryMetadata
{
    "name": "030__cardinality_by_product_and_sequence",
    "dependencies": []
}
*/
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

/*
$QueryMetadata
{
    "name": "040__cardinality_by_product_and_day",
    "dependencies": []
}
*/
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
