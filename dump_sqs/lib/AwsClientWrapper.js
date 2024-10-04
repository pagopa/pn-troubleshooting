
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { SQSClient, GetQueueUrlCommand, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");

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
    const response = await this._sqsClient.send(command);
    return response
  }

  async _deleteFromQueueMessage(queueUrl, receiptHandle) {
    const input = { // DeleteMessageRequest
      QueueUrl: queueUrl, // required
      ReceiptHandle: receiptHandle, // required
    };
    const command = new DeleteMessageCommand(input);
    const response = await this._sqsClient.send(command);
    return response;
  }
}
exports.AwsClientsWrapper = AwsClientsWrapper;

