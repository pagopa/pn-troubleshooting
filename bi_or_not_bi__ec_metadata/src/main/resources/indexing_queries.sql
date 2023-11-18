
----------------------------------------------------------------------------
-- 010_FORMAT_EC_METADATA
    SELECT
      get_json_object(json_string, '$.Item.requestId.S') as requestId,
      get_json_object(json_string, '$.Item.XPagopaExtchCxId.S') as clientId,
      get_json_object(json_string, '$.Item.digitalRequestMetadata.M.channel.S') as digitalMeta_channel,
      get_json_object(json_string, '$.Item.digitalRequestMetadata.M.correlationId.S') as digitalMeta_correlationId,
      get_json_object(json_string, '$.Item.digitalRequestMetadata.M.eventType.S') as digitalMeta_eventType,
      get_json_object(json_string, '$.Item.paperRequestMetadata.M.productType.S') as papeprMeta_productType,
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
      json_objects_ec_metadata
;
