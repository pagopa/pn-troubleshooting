
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
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

function clearAttributes(attributes){
  const eventsToRepublish = Object.values(attributes);
  eventsToRepublish.forEach(key => {
    key.StringListValues.length == 0 ? delete key.StringListValues : null
    key.BinaryListValues.length == 0 ? delete key.BinaryListValues : null
  })
  return attributes
}
class AwsClientsWrapper {

  constructor( envName, profileName, roleArn ) {
    const ssoProfile = `${envName}`
    this._sqsClient = new SQSClient( awsClientCfg( ssoProfile, profileName, roleArn ));
  }

  async init() {
    this._sqsNames = await this._fetchAllSQS();
  }

  async _sendEventToSQS(queueUrl, event, attributes) {
    const input = { // SendMessageRequest
      QueueUrl: queueUrl, // required
      MessageBody: JSON.stringify(event), // required
    };
    queueUrl.indexOf(".fifo") > 0 ? input["MessageGroupId"] = uuidv4() : null
    attributes ? input["MessageAttributes"] = clearAttributes(attributes) : null
    var response = {}
    try {
      const command = new SendMessageCommand(input);
      response = await this._sqsClient.send(command);
    }
    catch (error) {
      console.error("Problem during SendMessageCommand cause=", error)
    }
    return response;
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

