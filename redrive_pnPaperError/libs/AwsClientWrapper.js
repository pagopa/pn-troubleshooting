
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, DeleteItemCommand  } = require("@aws-sdk/client-dynamodb");
const { SQSClient, SendMessageCommand, GetQueueUrlCommand } = require("@aws-sdk/client-sqs");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager"); 
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

  constructor( envName, profileName, roleArn ) {
    const coreProfile = 'sso_pn-core-' + envName
    const confinfoProfile = 'sso_pn-confinfo-' + envName
    this._dynamoClient = new DynamoDBClient( awsClientCfg( coreProfile, profileName, roleArn ));
    this._sqsClient = new SQSClient( awsClientCfg( coreProfile, profileName, roleArn ));
    this._secretClient = new SecretsManagerClient( awsClientCfg( confinfoProfile, profileName, roleArn ));
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
      return response;
    }
    catch (error) {
      console.error("Problem during SendMessageCommand cause=", error)
    }
  }

  async _getSecretKey(secretId) {
    const input = { // GetSecretValueRequest
      SecretId: secretId, // required
    };
    var response = {}
    try {
      const command = new GetSecretValueCommand(input);
      response = await this._secretClient.send(command);
      return JSON.parse(response.SecretString);
    }
    catch (error) {
      console.error("Problem during SendMessageCommand cause=", error)
      process.exit(1)
    }
  }

  async _getQueueUrl(queueName) {
    const input = { // GetQueueUrlRequest
      QueueName: queueName, // required
    };
    var response = {}
    try {
      const command = new GetQueueUrlCommand(input);
      const response = await this._sqsClient.send(command);
      return response.QueueUrl;
    }
    catch (error) {
      console.error("Problem during getQueueUrlCommand cause=", error)
      process.exit(1)
    }
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

