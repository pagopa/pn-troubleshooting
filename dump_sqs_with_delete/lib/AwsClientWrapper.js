
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { SQSClient, GetQueueUrlCommand, ReceiveMessageCommand, DeleteMessageCommand, DeleteMessageBatchCommand } = require("@aws-sdk/client-sqs");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function awsClientCfg( profile, region ) {
  const self = this;
  //if(!profileName){
    return {
      region: region,
      credentials: fromIni({ 
        profile: profile
      })
    }
  //}
}

class AwsClientsWrapper {

  constructor( profile, region, profileName, roleArn) {
    if(region) {
      this.region = region;
    }
    else {
      this.region = "eu-south-1";
    }
    this._sqsClient = new SQSClient( awsClientCfg( profile, this.region, profileName, roleArn ));
  }

  async init() {
    console.log("Configuring aws client...")
  }

  async _getQueueUrl(queueName) {
    const input = { // GetQueueUrlRequest
      QueueName: queueName, // required
    };
    const command = new GetQueueUrlCommand(input);
    const response = await this._sqsClient.send(command);
    return response.QueueUrl;
  }

  async _receiveMessages(queueUrl, maxNumberOfMessages, visibilityTimeout) {
    const input = { // ReceiveMessageRequest
      QueueUrl: queueUrl, // required
      AttributeNames: [ // AttributeNameList
        "All"
      ],
      MessageAttributeNames: [ // MessageAttributeNameList
        "All",
      ],
      MaxNumberOfMessages: maxNumberOfMessages,
      VisibilityTimeout: visibilityTimeout,
      WaitTimeSeconds: 5,
      //ReceiveRequestAttemptId: "STRING_VALUE",
    };
    const command = new ReceiveMessageCommand(input);
    return await this._sqsClient.send(command)
  }


  async _deleteMessages(queueUrl, messages, deleteMode) {

    if (!messages || messages.length === 0) {
      return;
    }

    if (messages.length === 1 && deleteMode === 'single') {
      await this.deleteSingleMessage(queueUrl, messages[0])
    }
    else {
      await this.deleteInBatch(queueUrl, messages);
    }
  }

  async deleteSingleMessage(queueUrl, message) {
    try {
      let input = {
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      };
      const command = new DeleteMessageCommand(input);
      return await this._sqsClient.send(command);
    }
    catch (error) {
      console.error(`Errore nella deleteMessage, con messaggio: ${message}`)
    }
  }

  async deleteInBatch(queueUrl, messages, retries = 2) {
    let input = {
      QueueUrl: queueUrl,
      Entries: messages.map((message) => ({
        Id: message.MessageId,
        ReceiptHandle: message.ReceiptHandle,
      })),
    };
    try {
      const command = new DeleteMessageBatchCommand(input);
      const result = await this._sqsClient.send(command);

      if (result.Failed && result.Failed.length > 0) {
        console.log(`Some messages were not deleted: ${result.Failed.length}`);

        // Ritenta solo i messaggi che sono falliti
        const failedMessages = messages.filter((message) =>
            result.Failed.some((failed) => failed.Id === message.MessageId)
        );

        if (retries > 0) {
          console.log(`Retry for failed messages...`);
          await delay(3000); //aspetto 3 secondi
          await this._deleteMessages(queueUrl, failedMessages, retries - 1);
        } else {
          console.error(`The following messages were not deleted after N attempts:`, failedMessages);
          throw new Error('Some messages were not deleted after N attempts');
        }
      }
    } catch (error) {
      console.error(`Some messages were not deleted after N attempts: ${error}: ${messages}`);
      throw error;
    }
  }

}


exports.AwsClientsWrapper = AwsClientsWrapper;

