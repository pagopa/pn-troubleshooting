
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, DeleteItemCommand  } = require("@aws-sdk/client-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { unmarshall } = require("@aws-sdk/util-dynamodb")

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

  constructor( awsProfile, profileName, roleArn ) {
    this._dynamoClient = new DynamoDBClient( awsClientCfg( awsProfile, profileName, roleArn ))
    this._sqsClient = new SQSClient( awsClientCfg( awsProfile, profileName, roleArn ))
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
    return unmarshall(response.Items[0])
  }

  async _deleteRequest(tableName, key){
    const input = { // DeleteItemInput
      TableName: tableName, // required
      Key: { // Key // required
        "requestId": { // AttributeValue Union: only one key present
          S: key,
        }
      }
    };
    const command = new DeleteItemCommand(input);
    const response = await this._dynamoClient.send(command);
    return unmarshall(response.Items[0])
  }

  async _sendEventToSQS(queueUrl, data, attributes) {
    const input = { // SendMessageRequest
      QueueUrl: queueUrl, // required
      MessageBody: JSON.stringify(data), // required
      MessageAttributes: attributes
    };
    var response = {}
    try {
      const command = new SendMessageCommand(input);
      response = await this._sqsClient.send(command);
    }
    catch (error) {
      console.error("Problem during SendMessageCommand cause=", error)
    }
    return response;
  }

  
}

exports.AwsClientsWrapper = AwsClientsWrapper;

