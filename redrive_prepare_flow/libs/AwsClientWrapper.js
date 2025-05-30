
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, DeleteItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { SQSClient, SendMessageCommand, GetQueueUrlCommand } = require("@aws-sdk/client-sqs");
const { marshall } = require("@aws-sdk/util-dynamodb")

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
    const coreProfile = 'sso_pn-core-' + envName
    this._dynamoClient = new DynamoDBClient( awsClientCfg( coreProfile, profileName, roleArn ));
    this._sqsClient = new SQSClient( awsClientCfg( coreProfile, profileName, roleArn ));
  }

  async init() {
    console.log("Configuring aws client...")
  }

  async _queryRequest(tableName, key, value){
    const input = { // QueryInput
      TableName: tableName, // required
      KeyConditionExpression: `${key} = :k`,
      ExpressionAttributeValues: {
        ":k": {
          "S": value
        }
      },
    };
    const command = new QueryCommand(input);
    const response = await this._dynamoClient.send(command);
    return response.Items
  }

  async _putRequest(tableName, item){
    const input = { // PutItemInput
      TableName: tableName, // required
      Item: marshall(item)
    };
    const command = new PutItemCommand(input);
    await this._dynamoClient.send(command);
  }

  async _deleteRequest(tableName, requestId, created){
    const input = { // DeleteItemInput
      TableName: tableName, // required
      Key: { // Key // required
        "requestId": { // AttributeValue Union: only one key present
          S: requestId,
        },
        "created": { // AttributeValue Union: only one key present
          S: created,
        }
      }
    };
    const command = new DeleteItemCommand(input);
    const response = await this._dynamoClient.send(command);
    return response;
//    return unmarshall(response.Items[0])
  }

  async _sendEventToSQS(queueUrl, data, attributes) {
    const input = { // SendMessageRequest
      QueueUrl: queueUrl, // required
      MessageBody: JSON.stringify(data), // required
      MessageAttributes: attributes
    };
    const command = new SendMessageCommand(input);
    const response = await this._sqsClient.send(command);
    return response;
  }

  async _getQueueUrl(queueName) {
    const input = { // GetQueueUrlRequest
      QueueName: queueName, // required
    };
    const command = new GetQueueUrlCommand(input);
    const response = await this._sqsClient.send(command);
    return response.QueueUrl;
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

