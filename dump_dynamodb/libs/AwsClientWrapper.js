
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
    const input = { // ScanInputno
      TableName: tableName, // required
    };
    const command = new ScanCommand(input);
    const response = await this._dynamoClient.send(command);
    return response.Items
  }

  
}

exports.AwsClientsWrapper = AwsClientsWrapper;

