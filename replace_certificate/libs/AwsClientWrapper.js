
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { SSMClient, GetParameterCommand, PutParameterCommand} = require("@aws-sdk/client-ssm");
const { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand} = require("@aws-sdk/client-secrets-manager");
const { KMSClient, UpdateAliasCommand } = require("@aws-sdk/client-kms");
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
    this._ssmClient = new SSMClient( awsClientCfg( ssoCoreProfile, profileName, roleArn ))
    this._secretClient = new SecretsManagerClient( awsClientCfg( ssoCoreProfile, profileName, roleArn ))
    this._kmsClient = new KMSClient( awsClientCfg( ssoCoreProfile, profileName, roleArn ))
  }

  async _getSSMParameter(param) {
    const input = { // GetParameterRequest
      Name: param, // required
      WithDecryption: true || false,
    };
    const res = await this._ssmClient.send(new GetParameterCommand(input));
    if(res) {
      return res.Parameter.Value
    }
  }

  async _updateSSMParameter(name, value) {
    const input = { // PutParameterRequest
      Name: name, // required
      Value: value, // required
      Type: "String", 
      Overwrite: true,
      Tier: "Standard",
    };
    const command = new PutParameterCommand(input);
    const res = await this._ssmClient.send(command);
    if(res["$metadata"].httpStatusCode != 200) 
      this._errorDuringProcess(res.httpStatusCode, "_updateSSMParameter")
  }

  async _getSecretValue(param) {
    const input = { // GetSecretValueRequest
      SecretId: param, // required
    };
    const res = await this._secretClient.send(new GetSecretValueCommand(input));
    if(res) {
      return res.SecretString
    }
  }

  async _updateSecretValue(id, secret) {
    const input = { // UpdateSecretRequest
      SecretId: id, // required
      SecretString: secret,
    };
    const command = new UpdateSecretCommand(input);
    const res = await this._secretClient.send(command);
    if(res["$metadata"].httpStatusCode != 200) 
    this._errorDuringProcess(res.httpStatusCode, "_updateSecretValue")
  }

  async _updateAlias(alias, targetKeyId) {
    const input = { // UpdateAliasRequest
      AliasName: alias, // required
      TargetKeyId: targetKeyId, // required
    };
    const command = new UpdateAliasCommand(input);
    const res = await this._kmsClient.send(command);
    if(res["$metadata"].httpStatusCode != 200) 
      this._errorDuringProcess(res.httpStatusCode, "_updateAlias")
  }

  _getProfileBySQS(sqsName) {
    return sqsName in this._sqsNames.core ? "core" : "confinfo"
  }

  _errorDuringProcess(httpStatusCode, methodName){
    console.error("Error during process, HTTPStatusCode= " + httpStatusCode + " during " + methodName + " method execution")
    process.exit(1)
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

