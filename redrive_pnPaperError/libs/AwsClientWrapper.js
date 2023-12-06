
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
    return unmarshall(response.Items[0])
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

  async _getSecretKey(secretId) {
    const input = { // GetSecretValueRequest
      SecretId: secretId, // required
    };
    const command = new GetSecretValueCommand(input);
    const response = await this._secretClient.send(command);
    return JSON.parse(response.SecretString);
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

