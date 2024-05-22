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

function getLatestElement(eventsList, requestStatus){
  let res = eventsList.filter(element => { 
    const statusCode = element.paperProgrStatus.statusCode
    return statusCode == requestStatus
  }).reduce((latest, current) => {
    return new Date(latest.paperProgrStatus.clientRequestTimeStamp) < new Date(current.paperProgrStatus.clientRequestTimeStamp) ? current : latest;
  });
  let copyOf = JSON.parse(JSON.stringify(res))
  return copyOf
}

function getFirstElement(eventsList, requestStatus){
  let res = eventsList.filter(element => { 
    const statusCode = element.paperProgrStatus.statusCode
    return statusCode == requestStatus
  }).reduce((latest, current) => {
    return new Date(latest.paperProgrStatus.clientRequestTimeStamp) > new Date(current.paperProgrStatus.clientRequestTimeStamp) ? current : latest;
  });
  let copyOf = JSON.parse(JSON.stringify(res))
  return copyOf
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
        type: "string", short: "t", default: undefined
      },
      dryrun: {
        type: "boolean", short: "b", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const requestId =  fileRows[i]
    let result = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", 'pn-cons-000~' + requestId)
    let metadata = unmarshall(result.Items[0])
    let requestStatus = metadata.statusRequest
    let latestRequestStatusElement = getLatestElement(metadata.eventsList, requestStatus)
    delete latestRequestStatusElement["insertTimestamp"]
    delete latestRequestStatusElement.paperProgrStatus["clientRequestTimeStamp"]
    let first = true;
    let lego = metadata.eventsList.filter( el => {
      let tmp = JSON.parse(JSON.stringify(el))
      delete tmp["insertTimestamp"]
      delete tmp.paperProgrStatus["clientRequestTimeStamp"]
      if(JSON.stringify(tmp)!==JSON.stringify(latestRequestStatusElement)) {
        return true;
      }
      else {
        if(first) {
          first = false;
          return true;
        }
        return false;
      }
    })
    data = {
      eventsList: lego,
      version: metadata.version + 1,
      date: new Date().toISOString()
    }
    if(!dryrun) {
      await awsClient._updateItem("pn-EcRichiesteMetadati", metadata.requestId, data)
    }
    else {
      console.log("DRYRUN " + metadata.requestId + " " + JSON.stringify(data))
    }
    appendJsonToFile("result.json", metadata)
  }
}

main();