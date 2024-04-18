
----------------------------------------------------------------------------
-- pn-Notifications
  WITH
    only_notification_strings AS (
      SELECT
        json_string,
        get_json_object(json_string, '$.dynamodb.NewImage') as img
      FROM
        json_objects_cdc
      WHERE
        get_json_object(json_string, '$.dynamodb.NewImage.senderPaId.S') is not null
    ),
    decoded_string AS (
      SELECT
        get_json_object( json_string, '$.eventID') as eventid,
        json_string as fullEvent_json,
        get_json_object( json_string, '$.eventName') as eventname,
        get_json_object( json_string, '$.tableName') as tablename,
        get_json_object( json_string, '$.dynamodb.ApproximateCreationDateTime') as kinesis_dynamodb_ApproximateCreationDateTime,
        get_json_object( img, '$.iun.S') as iun,
        get_json_object( img, '$.cancelledByIun.S') as cancelledByIun,
        get_json_object( img, '$.cancelledIun.S') as cancelledIun,
        get_json_object( img, '$.group.S') as group,
        get_json_object( img, '$.idempotenceToken.S') as idempotenceToken,
        get_json_object( img, '$.notificationAbstract.S') as notificationAbstract,
        get_json_object( img, '$.notificationFeePolicy.S') as notificationFeePolicy,
        get_json_object( img, '$.pagoPaIntMode.S') as pagoPaIntMode,
        get_json_object( img, '$.paNotificationId.S') as paNotificationId,
        get_json_object( img, '$.paymentExpirationDate.S') as paymentExpirationDate,
        get_json_object( img, '$.physicalCommunicationType.S') as physicalCommunicationType,
        get_json_object( img, '$.requestId.S') as requestId,
        get_json_object( img, '$.senderDenomination.S') as senderDenomination,
        get_json_object( img, '$.senderPaId.S') as senderPaId,
        get_json_object( img, '$.senderTaxId.S') as senderTaxId,
        get_json_object( img, '$.sentAt.S') as sentAt,
        get_json_object( img, '$.sourceChannel.S') as sourceChannel,
        get_json_object( img, '$.sourceChannelDetails.S') as sourceChannelDetails,
        get_json_object( img, '$.subject.S') as subject,
        get_json_object( img, '$.taxonomyCode.S') as taxonomyCode,
        get_json_object( img, '$.amount.N') as amount,
        coalesce(
          cast( get_json_object( img, '$.version.N') as varchar(10) ),
          get_json_object( img, '$.version.S')
        ) as version,
        transform(
          transform(
            sequence(1, json_array_length( get_json_object( img, '$.documents.L')) ,1),
            x  -> get_json_object( img, concat('$.documents.L[', x-1, '].M'))
          ),
          x -> named_struct(
            'contentType', get_json_object(x, '$.contentType.S'),
            'digests_sha256', get_json_object(x, '$.digests.M.sha256.S'),
            'ref_key', get_json_object(x, '$.ref.M.key.S'),
            'ref_versionToken', get_json_object(x, '$.ref.M.versionToken.S'),
            'requiresAck', get_json_object(x, '$.requiresAck.BOOL'),
            'sendByMail', get_json_object(x, '$.sendByMail.BOOL'),
            'title', get_json_object(x, '$.title.S')
          )
        )
         as documents,
        transform(
          transform(
            sequence(1, json_array_length( get_json_object( img, '$.recipients.L')) ,1),
            x  -> get_json_object( img, concat('$.recipients.L[', x-1, '].M'))
          ),
          x -> named_struct(
            'denomination', get_json_object(x, '$.denomination.S'),
            'digitalDomicile_type', get_json_object(x, '$.digitalDomicile.M.type.S'),
            'payments',
            if( json_array_length( get_json_object(x, '$.payments.L')) > 0, transform(
              transform(
                sequence(1, json_array_length( get_json_object(x, '$.payments.L')) ,1),
                y  -> get_json_object( x, concat('$.payments.L[', y-1, '].M'))
              ),
              y -> named_struct(
                'noticeCode', get_json_object(y, '$.noticeCode.S'),
                'creditorTaxId', get_json_object(y, '$.creditorTaxId.S'),
                'applyCost', get_json_object(y, '$.applyCost.BOOL'),
                'pagoPaForm_contentType', get_json_object(y, '$.pagoPaForm.M.contentType.S'),
                'pagoPaForm_digests_sha256', get_json_object(y, '$.pagoPaForm.M.digests.M.sha256.S'),
                'pagoPaForm_ref_key', get_json_object(y, '$.pagoPaForm.M.ref.M.key.S'),
                'pagoPaForm_ref_versionToken', get_json_object(y, '$.pagoPaForm.M.ref.M.versionToken.S'),
                'f24_title', get_json_object(y, '$.f24.M.title.S'),
                'f24_applyCost', get_json_object(y, '$.f24.M.applyCost.BOOL'),
                'f24_contentType', get_json_object(y, '$.f24.M.metadataAttachment.M.contentType.S'),
                'f24_digests_sha256', get_json_object(y, '$.f24.M.metadataAttachment.M.digests.M.sha256.S'),
                'f24_ref_key', get_json_object(y, '$.f24.M.metadataAttachment.M.ref.M.key.S'),
                'f24_ref_versionToken', get_json_object(y, '$.f24.M.metadataAttachment.M.ref.M.versionToken.S')
              )
            ), array() ),
            'recipientId', get_json_object(x, '$.recipientId.S'),
            'recipientType', get_json_object(x, '$.recipientType.S')
          )
        )
         as recipients
      FROM
        only_notification_strings
    )
  SELECT
    *
  FROM
    decoded_string
;


----------------------------------------------------------------------------
-- pn-Timelines
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
    )
  SELECT
    *
  FROM
    decoded_string
;



----------------------------------------------------------------------------
-- pn-TimelinesForInvoicing
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
        get_json_object( json_string, '$.eventID') as kinesis_eventID,
        json_string as kinesis_fullEvent,
        get_json_object( json_string, '$.eventName') as kinesis_eventName,
        get_json_object( json_string, '$.tableName') as kinesis_tableName,
        get_json_object( json_string, '$.dynamodb.ApproximateCreationDateTime') as kinesis_dynamodb_ApproximateCreationDateTime,
        get_json_object( img, '$.paId_invoicingDay.S') as paId_invoicingDay,
        get_json_object( img, '$.invoincingTimestamp_timelineElementId.S') as invoincingTimestamp_timelineElementId,
        get_json_object( img, '$.invoicingDay.S') as invoicingDay,
        get_json_object( img, '$.invoincingTimestamp.S') as invoincingTimestamp,
        get_json_object( img, '$.ttl.N') as ttl,
        get_json_object( img, '$.iun.S') as iun,
        get_json_object( img, '$.timelineElementId.S') as timelineElementId,
        get_json_object( img, '$.category.S') as category,
        get_json_object( img, '$.details.M') as details_str,
        get_json_object( img, '$.notificationSentAt.S') as notificationSentAt,
        get_json_object( img, '$.paId.S') as paId,
        get_json_object( img, '$.timestamp.S') as tech_timestamp,
        get_json_object( img, '$.statusInfo.M.actual.S') as statusInfo_actual,
        get_json_object( img, '$.statusInfo.M.statusChanged.BOOL') as statusInfo_statusChanged,
        get_json_object( img, '$.statusInfo.M.statusChangeTimestamp.S') as statusInfo_statusChangeTimestamp,
        if(
          json_array_length( get_json_object( img, '$.legalFactId.L')) > 0,
          transform(
            transform(
              sequence(1, json_array_length( get_json_object( img, '$.legalFactId.L')) ,1),
              x -> get_json_object( img, concat('$.legalFactId.L[', x-1, '].M'))
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
    )
  SELECT
    *
  FROM
    decoded_string
;
