const { SendMessageCommand } = require("@aws-sdk/client-sqs");

function buildMessagePayload(record, resumeType) {
  return {
    iun: record.iun,
    recIndex: record.recIndex,
    resumeType,
  };
}

async function publishRecords({
  records,
  resumeType,
  queueUrl,
  sqsClient,
  logger = console,
  Command = SendMessageCommand,
}) {
  let publishedMessages = 0;
  let failedPublications = 0;

  for (const record of records) {
    const payload = buildMessagePayload(record, resumeType);

    try {
      const response = await sqsClient.send(new Command({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(payload),
      }));

      if (typeof response.MessageId !== "string" || !response.MessageId.trim()) {
        throw new Error("SQS response does not contain MessageId");
      }

      publishedMessages += 1;
      logger.log(JSON.stringify({
        event: "RESUME_POST_PAYMENT_PUBLISHED",
        ...payload,
        messageId: response.MessageId,
      }));
    } catch (error) {
      failedPublications += 1;
      logger.error(JSON.stringify({
        event: "RESUME_POST_PAYMENT_PUBLICATION_FAILED",
        ...payload,
        cause: getErrorCause(error),
      }));
    }
  }

  return { publishedMessages, failedPublications };
}

function getErrorCause(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unknown SQS publication error";
}

module.exports = {
  buildMessagePayload,
  publishRecords,
};