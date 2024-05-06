/*
$QueryMetadata
{
    "name": "pn-EcRichiesteMetadati",
    "dependencies": []
}
*/
    SELECT
      get_json_object(json_string, '$.Metadata_WriteTimestampMicros') as Metadata_WriteTimestampMicros,
      get_json_object(json_string, '$.Item.requestId.S') as requestId,
      get_json_object(json_string, '$.Item.XPagopaExtchCxId.S') as clientId,
      get_json_object(json_string, '$.Item.digitalRequestMetadata.M.channel.S') as digitalMeta_channel,
      get_json_object(json_string, '$.Item.digitalRequestMetadata.M.correlationId.S') as digitalMeta_correlationId,
      get_json_object(json_string, '$.Item.digitalRequestMetadata.M.eventType.S') as digitalMeta_eventType,
      get_json_object(json_string, '$.Item.paperRequestMetadata.M.productType.S') as paperMeta_productType,
      get_json_object(json_string, '$.Item.paperRequestMetadata.M.printType.S') as paperMeta_printType,
      get_json_object(json_string, '$.Item.requestTimestamp.S') as requestTimestamp,
      get_json_object(json_string, '$.Item.messageId.S') as messageId,
      get_json_object(json_string, '$.Item.clientRequestTimeStamp.S') as clientRequestTimeStamp,
      get_json_object(json_string, '$.Item.statusRequest.S') as statusRequest,
      get_json_object(json_string, '$.Item.version.N') as version,
      transform(
        transform(
          sequence(1, json_array_length( get_json_object(json_string, '$.Item.eventsList.L')) ,1),
          x  -> get_json_object(json_string, concat('$.Item.eventsList.L[', x-1, '].M'))
        ),
        x -> named_struct(
          'paperProg_statusDescription', get_json_object(x, '$.paperProgrStatus.M.statusDescription.S'),
          'paperProg_iun', get_json_object(x, '$.paperProgrStatus.M.iun.S'),
          'paperProg_deliveryFailureCause', get_json_object(x, '$.paperProgrStatus.M.deliveryFailureCause.S'),
          'paperProg_clientRequestTimeStamp', get_json_object(x, '$.paperProgrStatus.M.clientRequestTimeStamp.S'),
          'paperProg_statusDateTime', get_json_object(x, '$.paperProgrStatus.M.statusDateTime.S'),
          'paperProg_registeredLetterCode', get_json_object(x, '$.paperProgrStatus.M.registeredLetterCode.S'),
          'paperProg_productType', get_json_object(x, '$.paperProgrStatus.M.productType.S'),
          'paperProg_status', get_json_object(x, '$.paperProgrStatus.M.status.S'),
          'paperProg_statusCode', get_json_object(x, '$.paperProgrStatus.M.statusCode.S'),
          'paperProg_attachments', if (
            json_array_length( get_json_object(x, '$.paperProgrStatus.M.attachments.L')) > 0,
            transform(
              transform(
                sequence(1, json_array_length( get_json_object(x, '$.paperProgrStatus.M.attachments.L')) ,1),
                y  -> get_json_object(x, concat('$.paperProgrStatus.M.attachments.L[', y-1, '].M'))
              ),
              y  -> named_struct(
                'documentType', get_json_object(y, concat('$.documentType.S')),
                'uri', get_json_object(y, concat('$.uri.S')),
                'id', get_json_object(y, concat('$.id.S'))
              )
            ),
            array()
          ),
          'digProgr_eventCode', get_json_object(x, '$.digProgrStatus.M.eventCode.S'),
          'digProgr_generatedMessage_location', get_json_object(x, '$.digProgrStatus.M.generatedMessage.M.location.S'),
          'digProgr_generatedMessage_system', get_json_object(x, '$.digProgrStatus.M.generatedMessage.M.system.S'),
          'digProgr_generatedMessage_id', get_json_object(x, '$.digProgrStatus.M.generatedMessage.M.id.S'),
          'digProgr_eventDetails', get_json_object(x, '$.digProgrStatus.M.eventDetails.S'),
          'digProgr_eventTimestamp', get_json_object(x, '$.digProgrStatus.M.eventTimestamp.S'),
          'digProgr_status', get_json_object(x, '$.digProgrStatus.M.status.S')
        )
      )
       as event_list,
      json_array_length( get_json_object(json_string, '$.Item.eventsList.L')) as event_list_length
    FROM
      json_objects
;

/*
$QueryMetadata
{
    "name": "pn-SsDocumenti",
    "dependencies": []
}
*/
    SELECT
      get_json_object(json_string, '$.Metadata_WriteTimestampMicros') as Metadata_WriteTimestampMicros,
      get_json_object(json_string, '$.Item.documentKey.S') as documentKey,
      get_json_object(json_string, '$.Item.contentType.S') as contentType,
      get_json_object(json_string, '$.Item.clientShortCode.S') as clientShortCode,
      get_json_object(json_string, '$.Item.retentionUntil.S') as retentionUntil,
      get_json_object(json_string, '$.Item.documentState.S') as documentState,
      get_json_object(json_string, '$.Item.lastStatusChangeTimestamp.S') as lastStatusChangeTimestamp,
      get_json_object(json_string, '$.Item.documentLogicalState.S') as documentLogicalState,
      get_json_object(json_string, '$.Item.checkSum.S') as checkSum,
      get_json_object(json_string, '$.Item.contentLenght.N') as contentLenght,
      get_json_object(json_string, '$.Item.version.N') as version,
      get_json_object(json_string, '$.Item.documentType.M.tipoDocumento.S') as documentType_tipoDocumento,
      get_json_object(json_string, '$.Item.documentType.M.checksum.S') as documentType_checksum,
      get_json_object(json_string, '$.Item.documentType.M.informationClassification.S') as documentType_informationClassification,
      get_json_object(json_string, '$.Item.documentType.M.initialStatus.S') as documentType_initialStatus,
      get_json_object(json_string, '$.Item.documentType.M.timeStamped.S') as documentType_timeStamped,
      if (
        json_array_length( get_json_object(json_string, '$.Item.documentType.M.transformations.L')) > 0,
        transform(
          sequence(1, json_array_length( get_json_object(json_string, '$.Item.documentType.M.transformations.L')) ,1),
          x  -> get_json_object(json_string, concat('$.Item.documentType.M.transformations.L[', x-1, '].S'))
        ),
        array()
      )
       as documentType_transformations,
      get_json_object(json_string, '$.Item.documentType.M.statuses.M') as documentType_statuses
    FROM
      json_objects
;

/*
$QueryMetadata
{
    "name": "pn-PaperRequestError",
    "dependencies": []
}
*/
    SELECT
      get_json_object(json_string, '$.Metadata_WriteTimestampMicros') as Metadata_WriteTimestampMicros,
      if( get_json_object(json_string, '$.Item') is null, 'REMOVE', 'INSERT/MODIFY') as Metadata_Operation,

      coalesce(
        get_json_object(json_string, '$.Keys.requestId.S'),
        get_json_object(json_string, '$.Item.requestId.S')
      )
       as requestId,
      coalesce(
        get_json_object(json_string, '$.Keys.created.S'),
        get_json_object(json_string, '$.Item.created.S')
      ) as created,

      get_json_object(json_string, '$.Item.author.S') as author,
      get_json_object(json_string, '$.Item.error.S') as error,
      get_json_object(json_string, '$.Item.flowThrow.S') as flowThrow
    FROM
      json_objects
;
