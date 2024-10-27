
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, ScanCommand, QueryCommand  } = require("@aws-sdk/client-dynamodb");

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
  }

  async init() {
    console.log("Configuring aws client...")
  }

  async _scanRequest(tableName, filterExpression, attributeMapping, lastEvaluatedKey){
    const input = { // ScanInputno
      TableName: tableName, // required
      FilterExpression: filterExpression,
      ExpressionAttributeValues: attributeMapping,
    };

    lastEvaluatedKey ? input['ExclusiveStartKey'] = lastEvaluatedKey : null
    const command = new ScanCommand(input);
    const response = await this._dynamoClient.send(command);

    return response
  }

  async _queryTable(tableName, keyConditionExpression, expressionAttributeValues, lastEvaluatedKey, indexName){
    const input = {
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
    }

    lastEvaluatedKey ? input['ExclusiveStartKey'] = lastEvaluatedKey : null
    const command = new QueryCommand(input);
    const response = await this._dynamoClient.send(command);

    return response
  }
  
}

exports.AwsClientsWrapper = AwsClientsWrapper;

