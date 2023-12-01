const { AwsClientsWrapper } = require("../redrive_pnPaperError/libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { ApiClient } = require("../redrive_pnPaperError/libs/api");
const { v4: uuidv4 } = require('uuid');
require('dotenv').config()

const apiKey = process.env.API_KEY;
const queueUrl = process.env.QUEUE_URL;

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --awsProfile <aws-profile> --fileName <file-name> --prod"
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

async function _writeInFile(result, filename ) {
  fs.mkdirSync("result", { recursive: true });
  fs.writeFileSync('result/' + filename+'.json', JSON.stringify(result, null, 4), 'utf-8')
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
    "isF24Flow":false,
    "attempt":0,
    "clientId":""
  }
  prod ? delete data['isF24Flow'] : null
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
      "StringValue": "",
      "DataType": "String"
    },
    attempt : {
      "StringValue": "0",
      "DataType": "String"
    }
  }
  return attributes;
}

async function main() {

  const args = [
    { name: "awsProfile", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "prod", subcommand: [] },
  ]
  const values = {
    values: { awsProfile, fileName, prod},
  } = parseArgs({
    options: {
      awsProfile: {
        type: "string", short: "p", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
      prod: {
        type: "boolean", short: "e", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( awsProfile );
  
  const fileData = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }));
  for(let i = 0; i < fileData.length; i++){  //reinserire lunghezza di data.length
    const requestId = fileData[i].requestId.S
    const res = await awsClient._queryRequest("pn-PaperAddress", requestId)
    if(res.addressType == 'DISCOVERED_ADDRESS'){
      console.log("Flusso Postino")
      const data = _prepareQueueData(requestId)
      console.log(data)
      const attributes = _prepareAttributes(requestId)
      console.log(attributes)
      const res = await awsClient._sendEventToSQS(queueUrl, data, attributes)
      if ('MD5OfMessageBody' in res) {
        console.log("RequestId " + requestId + " sent successfully!!!")
        const res = await awsClient._deleteRequest("pn-PaperRequestError", requestId)
        if('ConsumedCapacity' in res) {
          if(res.ConsumedCapacity.CapacityUnits == 1) {
            console.log("RequestId " + requestId + " handled successfully!!!")
          }
          else {
            console.error("Problem to delete from pn-PaperRequestError " + requestId)
          }
        }
      }
      else {
        console.error("RequestId " + requestId + " failed!!!")
      }
    }
    else {
      console.log("Flusso Registro")
      const paperRequestDeliveryData = await awsClient._queryRequest("pn-PaperRequestDelivery", requestId)
      const result = {
        correlationId: paperRequestDeliveryData.correlationId,
        taxId: await ApiClient.decodeUID(paperRequestDeliveryData.fiscalCode, apiKey),
        receiverType: paperRequestDeliveryData.receiverType
      }
      console.log(result)
      await ApiClient.sendNationalRegistriesRequest(result.taxId, result.correlationId, result.receiverType)
    }
  }

}

main();