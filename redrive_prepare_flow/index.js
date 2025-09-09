const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { ApiClient } = require("./libs/api");
const { v4: uuidv4 } = require('uuid');
require('dotenv').config()
const { unmarshall } = require("@aws-sdk/util-dynamodb")

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--modify]"
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
  console.log(data)
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
      "StringValue": '0',
      "DataType": "String"
    }
  }
  return attributes;
}

async function _prepareDataAndSendEvents(awsClient, requestId, queueUrl) {
  const data = _prepareQueueData(requestId)
  const attributes = _prepareAttributes(requestId)
  console.log('message for requestId: ' +requestId, {
    data,
    attributes
  })
  
  res = await awsClient._sendEventToSQS(queueUrl, data, attributes)
  if ('MD5OfMessageBody' in res) {
    console.log("RequestId " + requestId + " sent successfully!!!")
  }
  else {
    failedRequestIds.push({ requestId: requestId, error: res })
    console.error("RequestId " + requestId + " failed!!!")
  }
}

async function _hasFoundEvents(awsClient, requestId) {
  const iun = (requestId.split("IUN_")[1]).split('.')[0]
  const send = requestId.replace("PREPARE", "SEND")
  const failure = (requestId.replace("DOMICILE", "DOMICILE_FAILURE")).split(".ATTEMPT")[0]
  const timelines = await awsClient._queryRequest("pn-Timelines", 'iun', iun)
  const foundSend = timelines.some(x=> {
    return x.timelineElementId.S == send || x.timelineElementId.S == failure}
  )
  return foundSend
}

const failedRequestIds = []

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, firstAttempt },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
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

  console.log('Reading from file...')
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const requestId = fileRows[i]
    const foundSend = await _hasFoundEvents(awsClient, requestId)
    if(foundSend) {
      console.log('Skipped requestId: ' + requestId)
      continue 
    }
    console.log('Handling requestId: ' + requestId)
    const isZeroAttempt = requestId.includes("ATTEMPT_0");
    const isRS = requestId.includes("PREPARE_SIMPLE_REGISTERED");
    let isDiscoveredAddress = false
    let res = await awsClient._queryRequest("pn-PaperAddress", 'requestId', requestId)
    if (res.length == 0) {
      console.log(`PaperAddres not found for requestId: ${requestId}`)
      continue
    }
    if(!isZeroAttempt && !isRS) {
      isDiscoveredAddress = res.some((e) => {
        return unmarshall(e).addressType == 'DISCOVERED_ADDRESS'
      })
    }
    if(isZeroAttempt || isDiscoveredAddress || isRS) {
      console.log("Postal Flow. Preparing data...")
      await _prepareDataAndSendEvents(awsClient, requestId, queueUrl)
    }
    else {
      console.log("Registry Flow. Retrieving taxId..")
      let res = await awsClient._queryRequest("pn-PaperRequestDelivery", "requestId", requestId)
      const paperRequestDeliveryData = unmarshall(res[0])
      res = await awsClient._queryRequest("pn-PaperAddress", 'requestId', paperRequestDeliveryData.relatedRequestId)
      if (res.length == 0) {
        console.log(`PaperAddress for ATTEMPT 1 not found for requestId: ${paperRequestDeliveryData.relatedRequestId}`)
        continue
      }
      let data = JSON.parse(JSON.stringify(paperRequestDeliveryData));
      let correlationId = paperRequestDeliveryData.correlationId ? paperRequestDeliveryData.correlationId : `NRG_ADDRESS_${requestId}`
      if(data.statusCode != "PC002" || !data.correlationId) {
        data.statusCode = "PC002"
        data.correlationId = correlationId
        await awsClient._putRequest("pn-PaperRequestDelivery", data)
      } 
      const { taxId } = await ApiClient.decodeUID(paperRequestDeliveryData.fiscalCode)

      if(!taxId){
        console.error("TaxId not found for requestId " + requestId+ " and fiscalCode " + paperRequestDeliveryData.fiscalCode + " and receiverType " + paperRequestDeliveryData.receiverType)
        failedRequestIds.push({ requestId: requestId, error: `Error to retrieve taxId: ${paperRequestDeliveryData.fiscalCode}` })
        continue
      }

      const result = {
        correlationId: correlationId,
        taxId: taxId,
        receiverType: paperRequestDeliveryData.receiverType
      }
      await ApiClient.sendNationalRegistriesRequest(result.taxId, result.correlationId, result.receiverType)
    }
  }
}

main()
.then(function(){
  console.log(JSON.stringify(failedRequestIds))
}) 