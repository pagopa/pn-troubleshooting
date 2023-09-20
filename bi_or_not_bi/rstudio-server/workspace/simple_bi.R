source( "common.R")

sc = local_spark()

# Download Enti
# aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
#   dynamodb scan \
#   --table-name "pn-OnboardInstitutions" \
#   --max-items 50000 \
#  | jq -r '.Items| .[] | tojson'

prepare_json_strings_from_cdc( sc, "raw_enti", "json_enti", "file:///home/rstudio/workspace/data/enti.jsons" )
sdf_sql(sc, " 
  create or replace temporary view enti as 
  SELECT 
    get_json_object(json_string, '$.id.S') as id,
    get_json_object(json_string, '$.description.S') as desc,
    get_json_object(json_string, '$.ipaCode.S') as ipaCode
  FROM
    json_enti
")

## Download apiKey
# aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
# dynamodb scan \
# --table-name "pn-apiKey" \
# --scan-filter '{"status":{"AttributeValueList":[ {"S":"ENABLED"} ],"ComparisonOperator": "EQ"}}' \
# --attributes-to-get "id" "x-pagopa-pn-cx-id" "pdnd" \
#   --max-items 50000 \
#  | jq -r '.Items| .[] | tojson'

prepare_json_strings_from_cdc( sc, "raw_apikey", "json_apikey", "file:///home/rstudio/workspace/data/apikey.jsons" )
sdf_sql(sc, " 
  create or replace temporary view apikey as 
  SELECT 
    get_json_object(json_string, '$.id.S') as id,
    get_json_object(json_string, '$.x-pagopa-pn-cx-id.S') as paId,
    get_json_object(json_string, '$.pdnd.BOOL') as pdnd
  FROM
    json_apikey
")

spark_read_csv( sc, "pdnd_purpouse_data", "file:///home/rstudio/workspace/data/pdnd__iscritti_pn.csv")

enti = sdf_collect( sdf_sql(sc, "
SELECT
  paId,
  first(ente) as paDesc,
  first(ipaCode) as ipaCode
--  concat_ws( ', ', collect_set( apiKeyId )) as apiKeysIds
FROM
  (
    SELECT
      e.id as paId,
      e.desc as ente,
      e.ipaCode as ipaCode,
      a.id as apiKeyId,
      a.pdnd as requirePdnd
    FROM
      enti e 
      JOIN apikey a ON e.id = a.paId
      JOIN pdnd_purpouse_data f ON f.codice = e.ipaCode
    WHERE
        a.pdnd = 'true'
      AND
        instr(upper( f.stato_finalita), 'ATTIVO' ) > 0
  )
   as all_api_keys
GROUP BY
  paId
"))

write.csv(enti, "data/out-onBoardingTech.csv", row.names=FALSE)




# Download CDC
# aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
#.    s3 sync  s3://${LOG_BUCKET}/cdcTos3/ cdc
prepare_json_strings_from_cdc( sc, "raw_cdc", "json_objects", "file:///home/rstudio/workspace/data/cdc/" )

sdf_sql(sc, " 
  create or replace temporary view cdc_objects as 
  SELECT 
    get_json_object(json_string, '$.tableName') as tableName,
    get_json_object(json_string, '$.eventName') as operationType,
    get_json_object(json_string, '$.dynamodb.NewImage') as newImg,
    get_json_object(json_string, '$.dynamodb.OldImage') as oldImg
  FROM
    json_objects
")


## Registrazione di recapiti e domicili digitali per girono
recapiti_e_domicili = sdf_collect( sdf_sql(sc, "
SELECT
  raw.sk_str as type,
  date_trunc( 'DD', created_str) as created_day,
  operationType,
  count( pk_str ) as n
FROM
(
  SELECT 
    get_json_object( (case operationType WHEN 'INSERT' THEN newImg ELSE newImg END), '$.pk.S') as pk_str,
    get_json_object( (case operationType WHEN 'INSERT' THEN newImg ELSE newImg END), '$.sk.S') as sk_str,
    operationType,
    get_json_object( (case operationType WHEN 'INSERT' THEN newImg ELSE newImg END), '$.created.S') as created_str
  FROM
    cdc_objects
  WHERE
      tableName = 'pn-UserAttributes'
    and 
      operationType in ( 'INSERT', 'DELETE' )
    and
      get_json_object( (case operationType WHEN 'INSERT' THEN newImg ELSE oldImg END), '$.pk.S' ) like 'AB#%'
    and 
      get_json_object( (case operationType WHEN 'INSERT' THEN newImg ELSE oldImg END), '$.sk.S' ) like '%#default#%'
)
 as raw
GROUP BY 
  raw.sk_str, operationType, date_trunc( 'DD', created_str)
"))

write.csv(recapiti_e_domicili, "data/out-recapiti_e_domicili.csv", row.names=FALSE)


## Notification Table
sdf_sql(sc, " 
  create or replace temporary view notifications_by_pa_and_day as 
  SELECT
    paId,
    sentAtDay,
    count(1) as n
  FROM
  (
    SELECT 
      get_json_object( newImg, '$.senderPaId.S' ) as paId,
      date_trunc( 'DD', get_json_object( newImg, '$.sentAt.S' )) as sentAtDay
    FROM
      cdc_objects
    WHERE
        tableName = 'pn-Notifications'
      and 
        operationType = 'INSERT'
      and
        get_json_object( newImg, '$.senderPaId.S' ) != '4a4149af-172e-4950-9cc8-63ccc9a6d865'
      and
        get_json_object( newImg, '$.senderPaId.S' ) is not null
  )
   as raw
  GROUP BY
    paId,
    sentAtDay
")

notifiche_per_pa = sdf_collect( sdf_sql(sc, "
SELECT
  *
FROM
  notifications_by_pa_and_day n
  JOIN enti e on n.paId = e.id
"))

write.csv(notifiche_per_pa, "data/out-notifiche_per_pa.csv", row.names=FALSE)

# Numero di RS spedite DIGITAL_FAILURE_WORKFLOW

digital_failures = sdf_collect( sdf_sql(sc, "
  SELECT 
      get_json_object( newImg, '$.paId.S' ) as paId,
      get_json_object( newImg, '$.iun.S' ) as iun
    FROM
      cdc_objects
    WHERE
        tableName = 'pn-Timelines'
      and 
        operationType = 'INSERT'
      and
        get_json_object( newImg, '$.paId.S' ) != '4a4149af-172e-4950-9cc8-63ccc9a6d865'        
      and
        get_json_object( newImg, '$.category.S' ) = 'DIGITAL_FAILURE_WORKFLOW'
"))
write.csv(digital_failures, "data/out-digital_failures.csv", row.names=FALSE)

# Numero di notifiche accettate

accepted_notification = sdf_collect( sdf_sql(sc, "
  SELECT 
      get_json_object( newImg, '$.paId.S' ) as paId,
      e.desc,
      get_json_object( newImg, '$.iun.S' ) as iun
    FROM
      cdc_objects
    JOIN enti e on get_json_object( newImg, '$.paId.S' ) = e.id  
    WHERE
        tableName = 'pn-Timelines'
      and 
        operationType = 'INSERT'
      and
        get_json_object( newImg, '$.paId.S' ) != '4a4149af-172e-4950-9cc8-63ccc9a6d865'        
      and
        get_json_object( newImg, '$.category.S' ) = 'REQUEST_ACCEPTED'
"))

write.csv(accepted_notification, "data/out-accepted_notification.csv", row.names=FALSE)