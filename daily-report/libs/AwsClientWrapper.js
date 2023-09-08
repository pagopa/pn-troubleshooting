
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { SQSClient, ListQueuesCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");

function awsClientCfg( profile ) {
  const self = this;
  if(!profileName){
    return { 
      region: "eu-south-1", 
      credentials: fromIni({ 
        profile: profile,
      })
    }
  }
}

class AwsClientsWrapper {

  constructor( envName, profileName, roleArn ) {
    const ssoCoreProfile = `sso_pn-core-${envName}`
    const ssoConfinfoProfile = `sso_pn-confinfo-${envName}`
    this._sqsClient = {
      core: new SQSClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      confinfo: new SQSClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
    } ;
  }

  async init() {
    this._sqsNames = await this._fetchAllSQS();
  }

  _getProfileBySQS(sqsName) {
    return sqsName in this._sqsNames.core ? "core" : "confinfo"
  }

  async _elabSqsNameUrl(profile){
    const input = { // ListQueuesRequest
      QueueNamePrefix: ""
    };
    const command = new ListQueuesCommand(input);
    const res = await this._sqsClient[profile].send( command )
    let sqs = {}
    console.log(profile)
    const dlqs = res.QueueUrls.filter((queue) => queue.includes("DLQ"));
    for (const dlq of dlqs) {
      const attributes = {
        QueueUrl: dlq,
        AttributeNames: ["ApproximateNumberOfMessages"] 
      } 
      const numberOfMessages = await this._sqsClient[profile].send(new GetQueueAttributesCommand(attributes))
      if(numberOfMessages.Attributes["ApproximateNumberOfMessages"] && numberOfMessages.Attributes["ApproximateNumberOfMessages"] > 0) {
        let key = dlq.substring(dlq.lastIndexOf("/") + 1)
        sqs[key] = numberOfMessages.Attributes["ApproximateNumberOfMessages"];
      }
    }
    return sqs
  }

  async _fetchAllDLQ() {
    let sqsValue = {
      core: {},
      confinfo: 
    }
    sqsValue.core = await this._elabSqsNameUrl("core")
    sqsValue.confinfo = await this._elabSqsNameUrl("confinfo")
    console.log(sqsValue)
    return sqsValue
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

