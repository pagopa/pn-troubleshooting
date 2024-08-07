const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function removeExtension(fileName) {
  const idx = fileName.lastIndexOf('.')
  if(idx > 0) {
    return fileName.substring(0, idx)
  }
  else {
    return fileName
  }
}

function appendJsonToFile(outputFolder, fileName, data){
  if(!fs.existsSync(`results/${outputFolder}`))
    fs.mkdirSync(`results/${outputFolder}`, { recursive: true });
  fs.appendFileSync(`results/${outputFolder}/${fileName}`, data + "\n")
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
      }
    },
  });  
  _checkingParameters(args, values)
  const fileNameWithoutExtension = removeExtension(fileName)
  const awsClient = new AwsClientsWrapper('confinfo', envName);
  awsClient._initDynamoDB();
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x => x != "")
  for(let i = 0; i < fileRows.length; i++){
    const requestId = fileRows[i];
    console.log(`Executing requestId ${requestId}`)
    let result = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", 'pn-cons-000~' + requestId)
    if(result.Items.length > 0) {
      result.Items.forEach(item => {
          const eventList = unmarshall(item).eventsList;
          let found = false;
          for (let event of eventList) {
            if(event.paperProgrStatus.discoveredAddress) {
              found = true
              console.log(`Found discovered address for requestId ${requestId}`)
              break;
            }
          }
          if(found) {
            appendJsonToFile(fileNameWithoutExtension, `found_discovered_address.txt`, requestId)
          }
          else {
            console.log(`Not found discovered address for requestId ${requestId}`)
            appendJsonToFile(fileNameWithoutExtension, `not_found_discovered_address.txt`, requestId)
          }
      });
    }
  }
  console.log("End Execution")
}

main();