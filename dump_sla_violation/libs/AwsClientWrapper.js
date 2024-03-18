
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");

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

  async _queryRequest(tableName, value, lastEvaluatedKey){
    const input = { // QueryInput
      TableName: tableName, // required
      IndexName: "activeViolations-index",
      ProjectionExpression: "sla_relatedEntityId",
      KeyConditionExpression: "active_sla_entityName_type = :k",
      ExpressionAttributeValues: {
        ":k": {
          "S": value
        }
      },
    };
    lastEvaluatedKey ? input['ExclusiveStartKey'] = lastEvaluatedKey : null
    const command = new QueryCommand(input);
    const response = await this._dynamoClient.send(command);
    return response
  }

  
}

exports.AwsClientsWrapper = AwsClientsWrapper;

