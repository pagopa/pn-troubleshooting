const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");


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
  console.log("requestId,version,statusRequest,lastUpdateTimestamp")
  for(let i = 0; i < fileRows.length; i++){
    const requestId =  fileRows[i]
    let result = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", 'pn-cons-000~' + requestId, 'confinfo')
    console.log(requestId + "," + result.Items[0].version.N + "," + result.Items[0].statusRequest.S +","+result.Items[0].lastUpdateTimestamp.S) 
  }
}

main();