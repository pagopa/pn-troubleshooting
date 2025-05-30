CREATE or replace temporary view timeline_cdc
USING text
OPTIONS (
  path "s3a://${CORE_BUCKET}/cdcTos3/TABLE_NAME_pn-Timelines/2024/10/*/*"
);

create or replace temporary view json_objects_cdc as 
select 
  '{' || lines_without_curly.json_string_without_curly || '}' as json_string
from (
  select 
    explode( 
      split( regexp_replace( regexp_replace( trim(value), '^\\{',''), '\\}$',''), '\\}[ \n]*\\{') 
    )
     as json_string_without_curly
  from timeline_cdc
)
 as lines_without_curly
     
WITH
    only_timeline_strings AS (
      SELECT
        json_string,
        get_json_object(json_string, '$.dynamodb.NewImage') as img
  FROM
    json_objects_cdc
),
decoded_string AS (
  SELECT
    get_json_object( json_string, '$.eventID') as eventid,
    json_string as fullEvent_json,
    get_json_object( json_string, '$.eventName') as eventname,
    get_json_object( json_string, '$.tableName') as tablename,
    get_json_object( json_string, '$.dynamodb.ApproximateCreationDateTime') as kinesis_dynamodb_ApproximateCreationDateTime,
    get_json_object( img, '$.iun.S') as iun,
    get_json_object( img, '$.timelineElementId.S') as timelineelementid,
    get_json_object( img, '$.timestamp.S') as timestamp,
    get_json_object( img, '$.category.S') as category,
    get_json_object( img, '$.details.M') as details,
    get_json_object( img, '$.notificationSentAt.S') as notificationsentat,
    get_json_object( img, '$.paId.S') as paid,
    named_struct (
      'actual', get_json_object( img, '$.statusInfo.M.actual.S'),
      'statusChanged', get_json_object( img, '$.statusInfo.M.statusChanged.BOOL'),
      'statusChangeTimestamp', get_json_object( img, '$.statusInfo.M.statusChangeTimestamp.S')
    )
     as statusinfo,
    if(
      json_array_length( get_json_object( img, '$.legalFactId.L')) > 0,
      transform(
        transform(
          sequence(1, json_array_length( get_json_object( img, '$.legalFactId.L')) ,1),
          x  -> get_json_object( img, concat('$.legalFactId.L[', x-1, '].M'))
        ),
        x -> named_struct(
          "category", get_json_object(x, '$.category.S'),
          "key", get_json_object(x, '$.key.S')
        )
      ),
      array()
    )
     as legalFactIds
  FROM
    only_timeline_strings
),
probable_notification_affected AS ( 
 SELECT
	iun,
	category,
	get_json_object( details, '$.legalFactId.S') as legalfact
  FROM
    decoded_string ds
where
  ds.category = 'SENDER_ACK_CREATION_REQUEST'
  and not exists (
    select 1 
   from decoded_string dst
   where 
     ds.iun = dst.iun
     and dst.category = 'REQUEST_ACCEPTED'
     and dst.category NOT LIKE 'SENDER_ACK_CREATION_REQUEST'
      )
   ) 
SELECT  
	*
FROM probable_notification_affected
;


