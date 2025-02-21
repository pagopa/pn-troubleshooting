
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { SQSClient, ListQueuesCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const { CloudWatchClient, GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");


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
    this._sqsClient = {
      core: new SQSClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      confinfo: new SQSClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
    } ;
    this._cloudwatchClient = {
      core: new CloudWatchClient( awsClientCfg( ssoCoreProfile, profileName, roleArn )),
      confinfo: new CloudWatchClient( awsClientCfg( ssoConfinfoProfile, profileName, roleArn ))
    } ;
  }

  async init() {
    this._sqsNames = await this._fetchAllSQS();
  }

  _getProfileBySQS(sqsName) {
    return sqsName in this._sqsNames.core ? "core" : "confinfo"
  }

  _prepareParameterInput(sqsName) {
    const params = {
      Namespace: "AWS/SQS",
      MetricName: "ApproximateAgeOfOldestMessage",
      Dimensions: [
        {
          Name: "QueueName",
          Value: sqsName
        }
      ],
      StartTime: new Date(Date.now() - 5 * 60 * 1000), // 5 minuti fa
      EndTime: new Date(), // Ora attuale
      Period: 60, // Intervallo di raccolta dei dati (in secondi)
      Statistics: ["Maximum"], // Recupera il valore massimo nel periodo
      Unit: "Seconds"
    };
    return params;
  }

  secondsToDays(seconds) {
    return Math.floor(seconds / (24 * 60 * 60));
  }
  
  async _getApproximateAgeFromCloudWatch(profile, sqsName) {
    const params = this._prepareParameterInput(sqsName)
    const response = await this._cloudwatchClient[profile].send(new GetMetricStatisticsCommand(params));
    if(response.Datapoints && response.Datapoints.length > 0) {
      return this.secondsToDays(response.Datapoints[0].Maximum)
    }
  
  }

  async _elabSqsNameUrl(profile){
    const input = { // ListQueuesRequest
      QueueNamePrefix: ""
    };
    const command = new ListQueuesCommand(input);
    const res = await this._sqsClient[profile].send( command )
    let sqs = {}
    const dlqs = res.QueueUrls.filter((queue) => queue.includes("DLQ"));
    for (const dlq of dlqs) {
      const attributes = {
        QueueUrl: dlq,
        AttributeNames: ["ApproximateNumberOfMessages"] 
      } 
      let sqsName = dlq.substring(dlq.lastIndexOf("/") + 1)
      const numberOfMessages = await this._sqsClient[profile].send(new GetQueueAttributesCommand(attributes))
      if(numberOfMessages.Attributes["ApproximateNumberOfMessages"] && numberOfMessages.Attributes["ApproximateNumberOfMessages"] > 0) {
        let days = await this._getApproximateAgeFromCloudWatch(profile, sqsName)
        sqs[sqsName] = {
          'messages': parseInt(numberOfMessages.Attributes["ApproximateNumberOfMessages"]),
          'age': days
        }
      }
    }
    return sqs
  }

  async _fetchAllDLQ() {
    let sqsValue = {
      core: {},
      confinfo: {}
    }
    sqsValue.core = await this._elabSqsNameUrl("core")
    sqsValue.confinfo = await this._elabSqsNameUrl("confinfo")
    return sqsValue
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;

