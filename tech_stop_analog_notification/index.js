const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { ApiClient } = require("./libs/api");
require('dotenv').config()
const { unmarshall } = require("@aws-sdk/util-dynamodb")

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --statusCode <status-code>"
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _prepareData(statusCode){
  const statusStopCode = {
    "PN998" : "Blocco tecnico Consolidatore-recapitista",
    "PN999" : "Blocco tecnico SEND"
  }
  const data = { 
    "event": {
      "paperProgrStatus": {
        "registeredLetterCode": "",
        "status": statusCode,
        "statusCode": statusCode,
        "statusDescription": statusStopCode[statusCode],
        "statusDateTime": new Date().toISOString(),
        "deliveryFailureCause": "",
        "attachments": []
      }
    }
  }   
  return data;
}

const failedRequestIds = []

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "statusCode", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, statusCode },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      statusCode: {
        type: "string", short: "s", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );

  console.log('Reading from file...')

  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  console.log(fileRows)
  for(let i = 0; i < fileRows.length; i++){
    const requestId = fileRows[i]
    const data = _prepareData(statusCode)
    await ApiClient.requestToExternalChannel(requestId, data)
    await sleep(1000)
    let res = await awsClient._queryRequest("pn-EcRichiesteMetadati", "pn-cons-000~" + requestId)
    const requestIdMetadata = unmarshall(res[0])
    if(requestIdMetadata.statusRequest === statusCode) {
      console.log("OK for RequestId=" + requestId)
    }
    else {
      console.log("Check RequestId=" + requestId)
      process.exit(1)
    }
  }
}

main()
.then(function(){
  console.log(JSON.stringify(failedRequestIds))
})