
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { GetQueueUrlCommand, SendMessageCommand, SQSClient } = require("@aws-sdk/client-sqs"); 


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
    const ssoConfInfoProfile = `sso_pn-confinfo-${envName}`
    const ssoCoreProfile = `sso_pn-core-${envName}`
    this._dynamoClient = new DynamoDBClient( awsClientCfg( ssoConfInfoProfile, profileName, roleArn ));
    this._sqsClient = new SQSClient( awsClientCfg( ssoCoreProfile, profileName, roleArn ));
  }

  async _queryRequest(tableName, key, value, projection){
    const input = { // QueryInput
      TableName: tableName, // required
      ProjectionExpression: projection,
      KeyConditionExpression: "#k = :k",
      ExpressionAttributeNames: { // ExpressionAttributeNameMap
        "#k": key,
      },
      ExpressionAttributeValues: {
        ":k": { "S": value }
      },
    };
    const command = new QueryCommand(input);
    return await this._dynamoClient.send(command);
  }

  async _getQueueURL(sqsName){
    const getUrlCommand = new GetQueueUrlCommand({ // SendMessageRequest
      QueueName: sqsName, // required
    });
    const result = await this._sqsClient.send(getUrlCommand);
    return result.QueueUrl
  }

  
  async _sendSQSMessage(sqsUrl, message, delay){
    const input = { // SendMessageRequest
      QueueUrl: sqsUrl, // required
      MessageBody: JSON.stringify(message), // required
      DelaySeconds: delay
    }
    //console.log(input)
    const command = new SendMessageCommand(input);
    const response = await this._sqsClient.send(command);
    return response;
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;
