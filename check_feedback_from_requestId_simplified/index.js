const { AwsClientsWrapper } = require("pn-common");
const { _getIunFromRequestId } = require("pn-common/libs/utils");
const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { unmarshall } = require("@aws-sdk/util-dynamodb");

function appendJsonToFile(filePath, fileName, data){
  if(!fs.existsSync(filePath))
    fs.mkdirSync(filePath, { recursive: true });
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
        type: "string", short: "t", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  const date = new Date().toISOString()
  const awsClient = new AwsClientsWrapper('core', envName);
  awsClient._initDynamoDB();
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x => x != "")
  for(let i = 0; i < fileRows.length; i++){
    const requestId =  fileRows[i]
    console.log(`Executing requestId ${requestId}`)
    const iun = _getIunFromRequestId(requestId)
    let result = await awsClient._queryRequest("pn-Timelines", "iun", iun)
    if(result.Items.length > 0) {
      let timelineEvents = result.Items;
      let feedbackString = "SEND_ANALOG_FEEDBACK.IUN_" + iun + requestId.split(iun)[1].split('.PCRETRY')[0]
      let feedbackEvent = timelineEvents.find(x => x.timelineElementId.S == feedbackString)
      if(feedbackEvent) {
        console.log(`found ${requestId}`)
        appendJsonToFile(`results/${envName}_${date}`, "found.json", JSON.stringify({[requestId]: unmarshall(feedbackEvent)}))
      }
      else {
        console.log(`not found ${requestId}`)
        appendJsonToFile(`results/${envName}_${date}`, "not_found.txt", requestId)
      }
    }
  }
  console.log("End Execution")
}

main();