const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const resultPath = `results/${new Date().toISOString()}`

function appendJsonToFile(fileName, data){
  if(!fs.existsSync(resultPath))
    fs.mkdirSync(resultPath, { recursive: true });
  fs.appendFileSync(`${resultPath}/${fileName}`, data + "\n")
}

function differenceInDays(date1Str, date2Str) {
  const date1 = new Date(date1Str.substring(0, 10)+ "Z");
  const date2 = new Date(date2Str.substring(0, 10)+ "Z");
  const diffMs = date2 - date1;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(diffMs / msPerDay);
}

function calculateStockDate(requestId, data, statusCode, days){
  let inesito = (data.find(x=> {
    return x.statusCode.S == "RECRN010"
  }))
  let preesito = (data.find(x=> {
    return x.statusCode.S == statusCode
  }))
  if(!inesito || !preesito) {
    console.log(`${requestId} not enough data available`)
    appendJsonToFile("nodata.txt", requestId)
    return
  }
  inesito = unmarshall(inesito)
  preesito = unmarshall(preesito)
  console.log(inesito.statusCode, inesito.statusDateTime)
  console.log(preesito.statusCode, preesito.statusDateTime)
  const diff = differenceInDays(inesito.statusDateTime, preesito.statusDateTime)
  const d = JSON.stringify({
    requestId: requestId,
    inesito: {
      statusCode: inesito.statusCode,
      statusDateTime: inesito.statusDateTime
    },
    preesito: {
      statusCode: preesito.statusCode,
      statusDateTime: preesito.statusDateTime
    },
    days: days
  })
  if(diff < 0) {
    appendJsonToFile("to_check.json", d)
  }
  else if (diff >= parseInt(days)) {
    appendJsonToFile("pass.json", d)
  }
  else {
    appendJsonToFile("not_pass.json", d)
  }
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --statusCode <status-code> --days <days>"
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
    { name: "statusCode", mandatory: true, subcommand: [] },
    { name: "days", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, statusCode, days },
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
      days: {
        type: "string", short: "d", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x=>x!='')
  for(let i = 0; i < fileRows.length; i++){
    const requestId =  fileRows[i]
    let result = await awsClient._queryRequest("pn-PaperEvents", "pk", `META##${requestId}`)
    if (result.Items.length > 0) {
      calculateStockDate(requestId, result.Items, statusCode, days)
      console.log(`RequestId ${requestId} found`)
    }
    else {
      console.log(`RequestId ${requestId} not found`)
    }
  }
}

main();