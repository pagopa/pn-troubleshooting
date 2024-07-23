
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { SQSClient, GetQueueUrlCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");

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
    const ssoCoreProfile = `sso_pn-core-${envName}`
    const ssoConfinfoProfile = `sso_pn-confinfo-${envName}`
    this._dynamoClient = {
      core: new DynamoDBClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      confinfo: new DynamoDBClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn )),
    }
    this._sqsClient = new SQSClient( awsClientCfg( ssoCoreProfile, profileName, roleArn ));
  }

  async _queryRequest(tableName, key, value, profile = 'core'){
    
    const input = { // QueryInput
      TableName: tableName, // required
      KeyConditionExpression: "#k = :k",
      ExpressionAttributeNames: { // ExpressionAttributeNameMap
        "#k": key,
      },
      ExpressionAttributeValues: {
        ":k": { "S": value }
      },
    };
    const command = new QueryCommand(input);
    return await this._dynamoClient[profile].send(command);
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
