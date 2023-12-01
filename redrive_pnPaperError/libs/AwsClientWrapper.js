
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, ScanCommand  } = require("@aws-sdk/client-dynamodb");

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

  async _scanRequest(tableName){
    const input = { // ScanInput
      TableName: tableName, // required
      ProjectionExpression: "#K",
      FilterExpression : "not contains(#E, :e1) AND not contains(#E, :e2) AND #F = :f1",
      ExpressionAttributeNames: { // ExpressionAttributeNameMap
        "#K": "requestId",
        "#E": "error",
        "#F": "flowThrow"
      },
      ExpressionAttributeValues: {
        ":f1": { S: "CHECK_ADDRESS_FLOW" },
        ":e1": { S: "PNADDR002" },
        ":e2": { S: "L’indirizzo non è presente a DB" },
      }
    };
    const command = new ScanCommand(input);
    const response = await this._dynamoClient.send(command);
    return response.Items
  }

  
}

exports.AwsClientsWrapper = AwsClientsWrapper;

