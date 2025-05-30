
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

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
    const ssoProfile = `${envName}`
    this._dynamoClient = new DynamoDBClient( awsClientCfg( ssoProfile, profileName, roleArn ));
  }

  async _batchWriteItems(tableName, items) {
    const content = []
    items.forEach(element => {
      content.push({ // WriteRequest
        PutRequest: { // PutRequest
          Item: element,
        },
      })
    });
    const input = { // BatchWriteItemInput
      RequestItems: { // BatchWriteItemRequestMap // required
        [tableName] : content,
      },
      ReturnConsumedCapacity: "TOTAL",
      ReturnItemCollectionMetrics: "SIZE",
    };
    var response = {}
    try {
      const command = new BatchWriteItemCommand(input);
      response = await this._dynamoClient.send(command);
    }
    catch (error) {
      console.error("Problem during BatchWriteItemCommand cause=", error)
      process.exit(1)
    }
    return response;
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

