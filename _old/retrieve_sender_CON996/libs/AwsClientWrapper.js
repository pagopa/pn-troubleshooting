
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

  constructor( envName, profileName, roleArn ) {
    const ssoProfile = `sso_pn-core-${envName}`
    this._dynamoClient = new DynamoDBClient( awsClientCfg( ssoProfile, profileName, roleArn ));
  }

  async _queryRequest(tableName, key){
    const input = { // QueryInput
      TableName: tableName, // required
      KeyConditionExpression: "iun = :i",
      ExpressionAttributeValues: {
        ":i": {
          "S": key
        }
      },
    };
    const command = new QueryCommand(input);
    return await this._dynamoClient.send(command);
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

