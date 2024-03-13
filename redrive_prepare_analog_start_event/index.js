const { AwsClientsWrapper } = require("../redrive_prepare_analog_address/lib/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { unmarshall } = require("@aws-sdk/util-dynamodb")

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
 
function _prepareQueueData(requestId){
  const regex = /([A-Z]{4}-[A-Z]{4}-[A-Z]{4}-\d{6}-[A-Z]-\d)/;
  const match = requestId.match(regex);
  const extractedString = match[0];
  var data = {
    "requestId": requestId,
    "iun": extractedString,
    "correlationId": null,
    "isAddressRetry":false,
    "attempt":0,
    "clientId":""
  }
  if (envName == 'uat') {
    data['isF24Flow'] = false
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
        "StringValue": "PREPARE_ASYNC_FLOW",
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
    "x-client-id" : {
      "StringValue": "pn-delivery-push",
      "DataType": "String"
    },
    attempt : {
      "StringValue": "0",
      "DataType": "String"
    }
  }
  return attributes;
}

const failedRequestIds = []

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      dryrun: {
        type: "boolean", short: "f", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  
  console.log('Preparing data...')
  const queueUrl = await awsClient._getQueueUrl('pn-paper_channel_requests');

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
    console.log("Preparing data to send...")
    const data = _prepareQueueData(requestId)
    const attributes = _prepareAttributes(requestId)
    console.log('message for requestId: ' + requestId, {
      data,
      attributes
    })
    if(!dryrun) {
      res = await awsClient._sendEventToSQS(queueUrl, data, attributes)
      if ('MD5OfMessageBody' in res) {
          console.log("RequestId " + requestId + " sent successfully!!!")
      }
    }
    else {
      console.log("DRYRUN: RequestId " + requestId + " sent successfully!!!")
    }
  }
}

main()
.then(function(){
  console.log(JSON.stringify(failedRequestIds))
})