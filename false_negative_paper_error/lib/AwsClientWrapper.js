
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { SQSClient, GetQueueUrlCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb")

function awsClientCfg( profile ) {
  const self = this;
  //if(!profileName){
    return { 
      region: "eu-south-1", 
      credentials: fromIni({ 
        profile: profile,
      })
    }
  //}
}

class AwsClientsWrapper {

  constructor( envName, profileName, roleArn ) {
    const confinfoProfile = 'sso_pn-confinfo-' + envName
    this._dynamoClient = new DynamoDBClient( awsClientCfg( confinfoProfile, profileName, roleArn ));
    this._sqsClient = new SQSClient( awsClientCfg( confinfoProfile, profileName, roleArn ));
  }

  async init() {
    console.log("Configuring aws client...")
  }

  async _queryRequest(tableName, key){
    const input = { // QueryInput
      TableName: tableName, // required
      KeyConditionExpression: "requestId = :k",
      ExpressionAttributeValues: {
        ":k": {
          "S": key
        }
      },
    };
    const command = new QueryCommand(input);
    const response = await this._dynamoClient.send(command);
    return response.Items
  }

  async _getQueueUrl(queueName) {
    const input = { // GetQueueUrlRequest
      QueueName: queueName, // required
    };
    const command = new GetQueueUrlCommand(input);
    const response = await this._sqsClient.send(command);
    return response.QueueUrl;
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

