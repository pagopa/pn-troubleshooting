
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBClient, QueryCommand, UpdateItemCommand, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { prepareKeys, prepareExpressionAttributeNames, prepareExpressionAttributeValues, prepareUpdateExpression } = require("./dynamoUtil");

function awsClientCfg( profile ) {
  const self = this;
  return { 
    region: "eu-south-1", 
    credentials: fromIni({ 
      profile: profile,
    })
  }
}

class AwsClientsWrapper {

  constructor(profile, envName) {
    if (profile == 'core') {
      this.ssoProfile = `sso_pn-core-${envName}`
    }
    else {
      this.ssoProfile = `sso_pn-confinfo-${envName}`
    }
    console.log("AWS Wrapper initialized for env " + envName)
  }

  _initDynamoDB() {
    this._dynamoClient = new DynamoDBClient( awsClientCfg( this.ssoProfile ));
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

  async _updateItem(tableName, keys, values, operator){
    const input = {
      TableName: tableName,
      Key: prepareKeys(keys),
      ExpressionAttributeNames: prepareExpressionAttributeNames(values),
      ExpressionAttributeValues: prepareExpressionAttributeValues(values),
      UpdateExpression: prepareUpdateExpression(operator, values),
      ReturnValues: 'ALL_NEW'
    }
    const command = new UpdateItemCommand(input)
    return await this._dynamoClient.send(command)
  }

  async _describeTable(tableName){
    const input = { // DescribeTableInput
      TableName: tableName, // required
    };
    const command = new DescribeTableCommand(input);
    return await this._dynamoClient.send(command)
  }

  async _getKeyFromSchema(tableName){
    const tableInfo = await this._describeTable(tableName)
    return tableInfo.Table.KeySchema
  }
}

module.exports = AwsClientsWrapper;
