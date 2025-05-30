const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const mapping = {
  "REQUEST_ACCEPTED": "ACCEPTED",
  "SEND_ANALOG_DOMICILE": "DELIVERING",
  "SEND_DIGITAL_DOMICILE": "DELIVERING", 
  "DIGITAL_DELIVERY_CREATION_REQUEST": "DELIVERED",
  "ANALOG_SUCCESS_WORKFLOW" : "DELIVERED",
  "DIGITAL_FAILURE_WORKFLOW": "DELIVERED",
  "NOTIFICATION_VIEWED":"VIEWED",
  "REFINEMENT":"EFFECTIVE_DATE",
  "COMPLETELY_UNREACHABLE":"UNREACHABLE",
  "NOTIFICATION_CANCELLED":"CANCELLED"
}

function appendJsonToFile(filePath, fileName, data){
  if(!fs.existsSync(filePath)) {
    fs.mkdirSync(filePath, { recursive: true });
    fs.appendFileSync(path.join(filePath, fileName), `iun, accepted, accepted_ts, next_status, next_status_ts\n`)
  }
  fs.appendFileSync(path.join(filePath, fileName), data + "\n")
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
  const now = new Date().toISOString()
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const iun =  fileRows[i]
    console.log(iun)
    let result = await awsClient._queryRequest("pn-Timelines", "iun", iun)
    let tmp = {};
    if(result.Items.length > 0 ) {
      const timelineEvents = result.Items
      timelineEvents.sort((a, b) => {
        return a.timestamp.S.localeCompare(b.timestamp.S);
      });
      timelineEvents.forEach(event => {
        if(event.timelineElementId.S.startsWith("REQUEST_ACCEPTED")) {
          tmp["accepted"] = true
          tmp["accepted_ts"] = event.timestamp.S
        }
        if(mapping[event.category.S]) {
          tmp["next_status"] = mapping[event.category.S]
          tmp["next_status_ts"] = event.timestamp.S
        }
      });
      appendJsonToFile(`results/${envName}_${now}`, "result.csv", `${iun}, ${tmp["accepted"]},${tmp["accepted_ts"]},${tmp["next_status"]},${ tmp["next_status_ts"]}`)
      console.log(JSON.stringify(tmp))
    }
  }
}

main();