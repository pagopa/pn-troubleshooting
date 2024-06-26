const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function diffDayFromToday(datems) {
  return Math.ceil(Math.abs(new Date().getTime() - datems) / (1000 * 60 * 60 * 24)) - 1 //removing today
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
        type: "string", short: "f", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const requestId =  fileRows[i]
    let result = await awsClient._queryRequest("pn-PaperAddress", "requestId", requestId)
    let tmp = 0;
    if(result.Items.length > 0){ 
      
      result.Items.forEach(e => {
        let item = unmarshall(e)
        item.ttl = item.ttl * 1000 //convert to milliseconds
        if(tmp == 0) {
          tmp = item.ttl
        }
        else {
          e.ttl < tmp ? tmp = item.ttl : null 
        }
      })
      console.log(`${requestId} expires on date ${new Date(tmp).toISOString()} - ${diffDayFromToday(tmp)} days remaining`)
    }
  }
}

main();