const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function appendJsonToFile(fileName, jsonData){
  if(!fs.existsSync("files"))
    fs.mkdirSync("files", { recursive: true });
  fs.appendFileSync(fileName, JSON.stringify(jsonData) + "\n")
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
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  let counter = {}
  for(let i = 0; i < fileRows.length; i++){
    console.log(i+1)
    const requestId =  fileRows[i]
    let result = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", 'pn-cons-000~' + requestId)
    if(result.Items.length === 0) {
      appendJsonToFile("notfound.json", requestId)
      continue
    }
    let metadata = unmarshall(result.Items[0])
    !counter[metadata.statusRequest] ? counter[metadata.statusRequest] = 0 : null
    counter[metadata.statusRequest] = counter[metadata.statusRequest] + 1
    console.log(metadata.statusRequest)
    if(metadata.statusRequest === "error") {
      appendJsonToFile("error.json", metadata)
    }
    else if(metadata.statusRequest != "booked" && metadata.statusRequest != "sent" && metadata.statusRequest != "retry") {
      appendJsonToFile("fromconsolidatore.json", metadata)
      console.log(requestId + " received response from consolidatore")
    }
    else {
      appendJsonToFile("toconsolidatore.json", metadata)
      console.log(requestId + " waiting for a response from consolidatore")
    }
  }
  appendJsonToFile("counter.json", counter)
}

main();