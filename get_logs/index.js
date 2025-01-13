const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function appendJsonToFile(fileName, data){
  if(!fs.existsSync(`results/${fileName}`))
    fs.mkdirSync(`results/${fileName}`, { recursive: true });
  fs.appendFileSync(`results/${fileName}/results.json`, JSON.stringify(data) + "\n")
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --account <account> --logGroup <log-group> --logStream <log-stream> --startDate <start-date> --amountTime <amount-time>"
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
    { name: "account", mandatory: true, subcommand: [] },
    { name: "logGroup", mandatory: true, subcommand: [] },
    { name: "logStream", mandatory: true, subcommand: [] },
    { name: "startDate", mandatory: true, subcommand: [] },
    { name: "amountTime", mandatory: true, subcommand: [] },

  ]
  const values = {
    values: { envName, account, logGroup, logStream, startDate, amountTime },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      account: {
        type: "string", short: "p", default: undefined
      },
      logGroup: {
        type: "string", short: "l", default: undefined
      },
      logStream: {
        type: "string", short: "s", default: undefined
      },
      startDate: {
        type: "string", short: "d", default: undefined
      },
      amountTime: {
        type: "string", short: "t", default: undefined
      },
    },
  });  
  _checkingParameters(args, values);
  const output = new Date().toISOString()
  const awsClient = new AwsClientsWrapper( account, envName );
  awsClient._initCloudwatch();
  const startDateInMillis = new Date(startDate).getTime()
  const endDateInMillis = startDateInMillis + (amountTime * 60 * 1000)
  let first = true;
  let token;
  while(first || token) {
    const result = await awsClient._getLogsEvents(logGroup, logStream, startDateInMillis, endDateInMillis, 10000, token)
    console.log(`found ${result.events.length} logs`)
    token = result.nextForwardToken
    if(result.events.length > 0) {
      appendJsonToFile(`${output}-${envName}`, result.events)
    }
    else {
      token = undefined
    }
    first = false;
  }
}

main();