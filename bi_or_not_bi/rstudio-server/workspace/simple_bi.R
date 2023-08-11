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

enti = sdf_collect( sdf_sql(sc, "
SELECT
  *
FROM
  enti
"))


write.csv(enti, "data/enti.csv", row.names=FALSE)

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

apikey = sdf_collect( sdf_sql(sc, "
SELECT
  *
FROM
  apikey
"))


write.csv(apikey, "data/apikey", row.names=FALSE)



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


## Notification Table
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


