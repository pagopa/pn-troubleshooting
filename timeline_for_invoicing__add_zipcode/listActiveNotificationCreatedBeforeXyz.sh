AWS_PROFILE="sso_pn-core-prod"
AWS_REGION="eu-south-1"

DYNAMO_TABLE="pn-ProgressionSensorData"

date="2023-09-20"
if ( [ ! -z "$1" ] ) then
  date=$1
fi

rm -rf out/before_date/
mkdir -p out/before_date/


echo "Extract notification refinement and validation activity step started before ${date}"

aws --profile "$AWS_PROFILE" --region "$AWS_REGION" \
    dynamodb scan \
    --table-name "$DYNAMO_TABLE" \
    --projection-expression "entityName_type_relatedEntityId,id,relatedEntityId,startTimestamp,endTimeStamp" \
    --filter-expression "\
          ( \
              begins_with( entityName_type_relatedEntityId, :a1 ) \
            OR \
              begins_with( entityName_type_relatedEntityId, :a2 ) \
            OR \
              begins_with( entityName_type_relatedEntityId, :a3 ) \
            OR \
              begins_with( entityName_type_relatedEntityId, :a4 ) \
          ) \
        AND \
          startTimestamp < :b"\
    --expression-attribute-values "{ \
        \":a1\": { \"S\": \"step##REFINEMENT\"}, \
        \":a2\": { \"S\": \"step##VALIDATION\"}, \
        \":a3\": { \"S\": \"sla##REFINEMENT\"}, \
        \":a4\": { \"S\": \"sla##VALIDATION\"}, \
        \":b\": { \"S\": \"${date}T00:00:00.000000000Z\"} }" \
    --max-items 2000 \
  | tee out/before_date/active_steps_and_all_slas.json \
  | jq -r '.Items | .[] | select( false == ( (.entityName_type_relatedEntityId.S | startswith("sla#")) and .endTimeStamp != null ) ) | tojson' \
  | tee out/before_date/active_steps_and_active_slaviolation.json_lines 
