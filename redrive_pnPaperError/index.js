const { AwsClientsWrapper } = require("../redrive_pnPaperError/libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { ApiClient } = require("../redrive_pnPaperError/libs/api");
const { v4: uuidv4 } = require('uuid');
require('dotenv').config()
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb")

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
      "StringValue": "0",
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
    const fileData = JSON.parse(fileRows[i])
    const requestId = fileData.requestId.S
    const created = fileData.created.S
    console.log('Handling requestId: ' + requestId)
    let res = await awsClient._queryRequest("pn-PaperAddress", requestId)
    let isDiscoveredAddress = res.some((e) => {
      return unmarshall(e).addressType == 'DISCOVERED_ADDRESS'
    })
    console.log(isDiscoveredAddress)
    if(isDiscoveredAddress){
      console.log("Postal Flow. Preparing data...")
      const data = _prepareQueueData(requestId)
      const attributes = _prepareAttributes(requestId)
      console.log('message for requestId: ' +requestId, {
        data,
        attributes
      })

      res = await awsClient._sendEventToSQS(queueUrl, data, attributes)
      if ('MD5OfMessageBody' in res) {
        console.log("RequestId " + requestId + " sent successfully!!!")
        await awsClient._deleteRequest("pn-PaperRequestError", requestId, created)
        /*if('ConsumedCapacity' in res) {
          if(res.ConsumedCapacity.CapacityUnits == 1) {
            console.log("RequestId " + requestId + " deleted successfully!!!")
          }
          else {
            console.error("Problem to delete from pn-PaperRequestError " + requestId)
          }
        }*/
      }
      else {
        failedRequestIds.push({ requestId: requestId, error: res })
        console.error("RequestId " + requestId + " failed!!!")
      }
    }
    else {
      console.log("Registry Flow. Retrieving taxId..")
      res = await awsClient._queryRequest("pn-PaperRequestDelivery", requestId)
      console.log(res)
      const paperRequestDeliveryData = unmarshall(res[0])
      let data = JSON.parse(JSON.stringify(paperRequestDeliveryData));
      data.statusCode != "PC002" ? data.statusCode = "PC002" : null
      await awsClient._putRequest("pn-PaperRequestDelivery", data)
      let taxId;
      if(paperRequestDeliveryData.receiverType == 'PF') {
        res = await ApiClient.decodeUID(paperRequestDeliveryData.fiscalCode, baseUrlPDV, secrets.apiKeyPF)
        taxId = res.pii
      }
      else {
        res = await ApiClient.decodeUID(paperRequestDeliveryData.fiscalCode, baseUrlSelfcare, secrets.apiKeyPG)
        taxId = res.taxCode
      }

      if(!taxId){
        console.error("TaxId not found for requestId " + requestId+ " and fiscalCode " + paperRequestDeliveryData.fiscalCode + " and receiverType " + paperRequestDeliveryData.receiverType)
        failedRequestIds.push({ requestId: requestId, error: res })
        continue
      }

      const result = {
        correlationId: paperRequestDeliveryData.correlationId,
        taxId: taxId,
        receiverType: paperRequestDeliveryData.receiverType
      }
      console.log(result)
      await ApiClient.sendNationalRegistriesRequest(result.taxId, result.correlationId, result.receiverType)

      await awsClient._deleteRequest("pn-PaperRequestError", requestId, created)
      /*if('ConsumedCapacity' in res) {
        if(res.ConsumedCapacity.CapacityUnits == 1) {
          console.log("RequestId " + requestId + " deleted successfully!!!")
        }
        else {
          console.error("Problem to delete from pn-PaperRequestError " + requestId)
        }
      }*/

    }
  }

}

main()
.then(function(){
  console.log(JSON.stringify(failedRequestIds))
})