const { AwsClientsWrapper } = require("../redrive_pnPaperError/libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { ApiClient } = require("../redrive_pnPaperError/libs/api");
const { v4: uuidv4 } = require('uuid');
require('dotenv').config()


function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --prod"
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
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, prod},
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
  const baseUrlSelfcare = envName == 'prod' ? process.env.SELFCARE_BASE_URL : process.env.SELFCARE_BASE_UAT_URL;
  const baseUrlPDV = envName == 'prod' ? process.env.PDV_BASE_URL : process.env.PDV_BASE_UAT_URL;
  const secrets =  {
    apiKeyPF: apiKeys.TokenizerApiKeyForPF,
    apiKeyPG: apiKeys.SelfcareApiKeyForPG
  }

  console.log('Reading from file...')
  const fileData = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }));
  for(let i = 0; i < fileData.length; i++){  //reinserire lunghezza di data.length
    const requestId = fileData[i].requestId.S
    console.log('Handling requestId: ' + requestId)
    const res = await awsClient._queryRequest("pn-PaperAddress", requestId)
    if(res.addressType == 'DISCOVERED_ADDRESS'){
      console.log("Postal Flow. Preparing data...")
      const data = _prepareQueueData(requestId)
      const attributes = _prepareAttributes(requestId)
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
      console.log("Registry Flow. Retrieving taxId..")
      const paperRequestDeliveryData = await awsClient._queryRequest("pn-PaperRequestDelivery", requestId)
      var taxId;
      if(paperRequestDeliveryData.receiverType == 'PF') {
        const res = await ApiClient.decodeUID(paperRequestDeliveryData.fiscalCode, baseUrlPDV ,secrets.apiKeyPF)
        taxId = res.pii
      }
      else {
        const res = await ApiClient.decodeUID(paperRequestDeliveryData.fiscalCode, baseUrlSelfcare, secrets.apiKeyPG)
        taxId = res.taxCode
      }
      const result = {
        correlationId: paperRequestDeliveryData.correlationId,
        taxId: taxId,
        receiverType: paperRequestDeliveryData.receiverType
      }
      console.log(result)
      await ApiClient.sendNationalRegistriesRequest(result.taxId, result.correlationId, result.receiverType)
    }
  }

}

main();