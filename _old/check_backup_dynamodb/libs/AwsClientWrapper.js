
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { ListTablesCommand, DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { v4: uuidv4 } = require('uuid');

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
    const ssoCoreProfile = `sso_pn-core-${envName}`
    const ssoConfinfoProfile = `sso_pn-confinfo-${envName}`
    this._client = {
      core: new DynamoDBClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      confinfo: new DynamoDBClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
    }
  }

  async _fetchDynamoDbTables() {
    let dynamoTables = {
      core: {},
      confinfo: {}
    }
    dynamoTables.core = await this._getTableList("core")
    dynamoTables.confinfo = await this._getTableList("confinfo")
    return dynamoTables
  }

  async _getTableList(profile){
    const input = {};
    const command = new ListTablesCommand(input);
    const response = await this._client[profile].send(command);
    return response.TableNames
  }

}

exports.AwsClientsWrapper = AwsClientsWrapper;
