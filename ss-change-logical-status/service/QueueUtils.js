const { SQSClient, GetQueueUrlCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");

class QueueUtils {
  constructor(awsRegion) {
    this.client = new SQSClient({ region: awsRegion });
  }

  async getQueueLength(queueUrl) {
    const params = {
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages']
    };

    const command = new GetQueueAttributesCommand(params);
    const data = await this.client.send(command);
    return parseInt(data.Attributes.ApproximateNumberOfMessages, 10);
  }

  async waitForQueuesToEmpty(queueUrls) {
    let allQueuesEmpty = false;

    while (!allQueuesEmpty) {
      allQueuesEmpty = true;

      for (const url of queueUrls) {
        const queueLength = await this.getQueueLength(url);
        if (queueLength > 0) {
          allQueuesEmpty = false;
          await new Promise(resolve => setTimeout(resolve, 10000));
          break;
        }
      }
    }
  }

  async getQueueUrls(queueNames) {
    let queueUrls = [];

    for (const name of queueNames) {
      const input = {
        QueueName: name
      };

      try {
        const data = await this.client.send(new GetQueueUrlCommand(input));
        queueUrls.push(data.QueueUrl);
      } catch (err) {
        console.error(`Error getting URL for queue ${name}:`, err);
      }
    }

    if (queueUrls.length > 0) {
      await this.waitForQueuesToEmpty(queueUrls);
    }
  }
}

module.exports = QueueUtils;
