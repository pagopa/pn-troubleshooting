
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, DeleteItemCommand} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb")

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
  }

  async init() {
    console.log("Configuring aws client...")
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
      },
    };
    const command = new DeleteItemCommand(input);
    const response = await this._dynamoClient.send(command);
    return response;
  }

  async _queryTimeline(tableName, key){
    const input = { // QueryInput
      TableName: tableName, // required
      KeyConditionExpression: "iun = :k",
      ExpressionAttributeValues: {
        ":k": {
          "S": key
        }
      },
    };
    const command = new QueryCommand(input);
    const response = await this._dynamoClient.send(command);
    return response
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

