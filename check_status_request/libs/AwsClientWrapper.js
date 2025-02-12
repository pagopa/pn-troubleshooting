
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");

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
    const ssoProfile = `sso_pn-confinfo-${envName}`
    this._dynamoClient = new DynamoDBClient( awsClientCfg( ssoProfile, profileName, roleArn ));
  }

  async _queryRequest(tableName, key, value){
    
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
    return await this._dynamoClient.send(command);
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;
