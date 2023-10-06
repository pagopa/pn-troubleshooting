
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
    const ssoProfile = `sso_pn-confinfo-${envName}`
    this._dynamoDBClient = new DynamoDBClient( awsClientCfg( ssoProfile, profileName, roleArn ));
  }

  async init() {
    //this._sqsNames = await this._fetchAllSQS();
  }
  
  async _queryDynamoDB(tableName, indexValue, params) {
    const input = {
      TableName: tableName,
      IndexName: indexValue,
      Select: "ALL_ATTRIBUTES",
      ExpressionAttributeValues: params.ExpressionAttributeValues,
      Limit: 5,
      KeyConditionExpression: params.KeyConditionExpression,
    }
    const command = new QueryCommand(input);
    const resultList = []
    while (true) {
      const res = await this._dynamoDBClient.send(command)
      if(res["$metadata"].httpStatusCode == 200) {
        res.Items.forEach(item => {
          resultList.push(item)
        })
        if (res.LastEvaluatedKey == undefined){
          break;
        }
        else {
          input.ExclusiveStartKey = res.LastEvaluatedKey;
        }
      }
      else {
        console.error("Error executing _queryDynamoDB")
      }
    }
    return resultList;
  };
}

exports.AwsClientsWrapper = AwsClientsWrapper;

