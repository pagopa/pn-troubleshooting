const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function appendJsonToFile(fileName, data){
  if(!fs.existsSync(`results`))
    fs.mkdirSync(`results`, { recursive: true });
  fs.appendFileSync(`results/${fileName}`, data + "\n")
}

function diffDayFromToday(datems) {
  return Math.ceil(Math.abs(new Date().getTime() - datems) / (1000 * 60 * 60 * 24)) - 1 //removing today
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--expires <expires>]"
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
    { name: "expires", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, expires },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      expires: {
        type: "string", short: "s", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  let expiresDays;
  if(expires) {
    expiresDays = Number(expires)
  }
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
      const diffDays = diffDayFromToday(tmp)
      console.log(`${requestId} expires on date ${new Date(tmp).toISOString()} - ${diffDays} days remaining`)
      if(expiresDays) {
        if(expiresDays >= diffDays) {
          appendJsonToFile("to_extend.txt", requestId)
        }
        else {
          appendJsonToFile("not_extend.txt", requestId)
        }
      }
      else { 
        appendJsonToFile("to_extend.txt", requestId)
      }
    }
    else {
      console.log(`RequestId ${requestId} not found`)
      appendJsonToFile("not_found.txt", requestId)
    }
  }
}

main();