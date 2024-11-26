const { marshall } = require("@aws-sdk/util-dynamodb");

function prepareMessageBatchRequestEntries(id, messageBody, delay, messageDeduplicationId, messageGroupId) {
    const msg = {
      Id: id,
      MessageBody: messageBody,
      DelaySeconds: delay,
      MessageDeduplicationId: messageDeduplicationId,
      MessageGroupId: messageGroupId
    }
    return msg;
  }
  
module.exports = { 
  prepareMessage
};