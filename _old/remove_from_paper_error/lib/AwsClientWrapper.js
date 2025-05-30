
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

  async _queryRequest(tableName, key, condition){
    const input = { // QueryInput
      TableName: tableName, // required
      KeyConditionExpression: "requestId = :k",
      ExpressionAttributeValues: {
        ":k": {
          "S": key
        }
      },
    };
    const conditionParsed = JSON.parse(condition)
    console.log(input)
    if (Object.keys(conditionParsed)[0].indexOf('created') >= 0) {
      input.KeyConditionExpression = input.KeyConditionExpression + " AND created " + conditionParsed.created.operator + " :valore";
      input.ExpressionAttributeValues[":valore"] = { "S": conditionParsed.created.value }
    }
    console.log(input)
    const command = new QueryCommand(input);
    const response = await this._dynamoClient.send(command);
    return response.Items
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

