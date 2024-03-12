const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { ApiClient } = require("./libs/api");
const { v4: uuidv4 } = require('uuid');
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { time } = require("console");

function _getLatestTimelineEvent(timelineEvents){
  let tmp = null;
  for (q=0; q < timelineEvents.length; q++) {
    let timelineEvent = unmarshall(timelineEvents[q]);
    if(tmp == null) {
      tmp = timelineEvent
    }
    else {
      if(tmp.timestamp < timelineEvent.timestamp) {
        tmp = timelineEvent
      }
    }
  }
  return tmp;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name>"
  //CHECKING PARAMETER
  args.forEach(el => {
    if(el.mandatory && !values.values[el.name]){
      console.log("Param " + el.name + " is not defined")
      console.log(usage)
      process.exit(1)
    }
  })
  args.filter(el=> {
    return el.subcommand.length > 0
  }).forEach(el => {
    if(values.values[el.name]) {
      el.subcommand.forEach(val => {
        if (!values.values[val]) {
          console.log("SubParam " + val + " is not defined")
          console.log(usage)
          process.exit(1)
        }
      })
    }
  })
}

function _prepareQueueData(requestId, item){
  const regex = /([A-Z]{4}-[A-Z]{4}-[A-Z]{4}-\d{6}-[A-Z]-\d)/;
  const match = requestId.match(regex);
  const extractedString = match[0];
  var data = {
    "requestId": requestId,
    "relatedRequestId": item.relatedRequestId,
    "receiverType": item.receiverType,
    "iun": item.iun,
    "correlationId": "NRG_ADDRESS_" + requestId
    }
  return data
}

function _prepareAttributes(requestId){
  const attributes = {
    publisher: {
        StringValue: "paper-channel-prepare",
        DataType: "String"
    },
    eventId: {
        "StringValue": uuidv4(),
        "DataType": "String"
    },
    eventType: {
        "StringValue": "NATIONAL_REGISTRIES_ERROR",
        "DataType": "String"
    },
    createdAt: {
      "StringValue": new Date().toISOString(),
      "DataType": "String"
    },
    expired: {
      "StringValue":  new Date().toISOString(),
      "DataType": "String"
    },
    attempt : {
      "StringValue": "1",
      "DataType": "String"
    }
  }
  return attributes;
}

const urls = {
  uat: {
    pdv: 'https://api.uat.tokenizer.pdv.pagopa.it',
    selfcare: 'https://api.uat.selfcare.pagopa.it'
  },
  hotfix: {
    pdv: 'https://api.uat.tokenizer.pdv.pagopa.it',
    selfcare: 'https://api.uat.selfcare.pagopa.it'
  },
  prod: {
    pdv: 'https://api.tokenizer.pdv.pagopa.it',
    selfcare: 'https://api.selfcare.pagopa.it'
  }
}

const failedRequestIds = []

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "p", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  
  console.log('Preparing data...')
  const queueUrl = await awsClient._getQueueUrl('pn-paper_channel_requests');
  const apiKeys = await awsClient._getSecretKey('pn-PersonalDataVault-Secrets')
  const baseUrlSelfcare = envName == 'prod' ? urls.prod.selfcare : urls.uat.selfcare
  const baseUrlPDV = envName == 'prod' ? urls.prod.pdv: urls.uat.pdv
  const secrets =  {
    apiKeyPF: apiKeys.TokenizerApiKeyForPF,
    apiKeyPG: apiKeys.SelfcareApiKeyForPG
  }

  console.log('Reading from file...')


  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const requestId = fileRows[i]
    const iun = requestId.split('IUN_')[1].split('.')[0]    
    console.log('Handling requestId: ' + requestId)
    let timelineEvents = await awsClient._queryRequest("pn-Timelines", "iun", iun)
    let latestTimelineEvent = _getLatestTimelineEvent(timelineEvents);
    if(latestTimelineEvent.timelineElementId !== requestId) {
      console.log("not latest timeline event " + requestId)
      console.log(latestTimelineEvent)
      continue;
    }
    let res = await awsClient._queryRequest("pn-PaperRequestDelivery", "requestId", requestId)
    if(res.length > 0) {
        for(let j = 0; j < res.length; j++) {
            const item = unmarshall(res[j])
            const data = _prepareQueueData(requestId, item)
            const attributes = _prepareAttributes(requestId, item)
            if(item.receiverType == 'PF') {
                res = await ApiClient.decodeUID(item.fiscalCode, baseUrlPDV, secrets.apiKeyPF)
                data["fiscalCode"] = res.pii
            } else {
            res = await ApiClient.decodeUID(item.fiscalCode, baseUrlSelfcare, secrets.apiKeyPG)
            data["fiscalCode"] = res.taxCode
            }
            console.log(data)
            console.log(attributes)
            res = await awsClient._sendEventToSQS(queueUrl, data, attributes)
            if ('MD5OfMessageBody' in res) {
                console.log("RequestId " + requestId + " sent successfully!!!")
            }
        }
    }
    else {
        console.log("RequestId " + requestId + " not found")
    }
    
    }
  }

main()
.then(function(){
  console.log(JSON.stringify(failedRequestIds))
})