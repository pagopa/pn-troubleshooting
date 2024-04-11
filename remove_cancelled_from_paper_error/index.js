const { AwsClientsWrapper } = require("./lib/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require("@aws-sdk/util-dynamodb")


function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync(fileName, data + "\n")
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--dryrun] "
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
    { name: "condition", mandatory: false, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, condition, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      condition: {
        type: "string", short: "c", default: undefined
      },
      dryrun: {
        type: "boolean", short: "d", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  
  console.log('Reading from file...')
  let counter = 0
  const lines = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  for( let i = 0; i < lines.length; i++ ){
    const line = lines[i]
    const jsonLine = JSON.parse(line)
    const requestId = jsonLine.requestId.S
    const created = jsonLine.created.S
    const iun = requestId.split("IUN_")[1].split(".")[0]
    const res = await awsClient._queryTimeline("pn-Timelines", iun)
    const hasCancelled = res.Items.filter(el => el.timelineElementId.S.indexOf("NOTIFICATION_CANCELLED.IUN_" + iun) >= 0).length > 0
    if(hasCancelled){
      if(dryrun){
        counter = counter + 1
        console.log("Dryrun Removing " + requestId + " " + created)
      }
      else {
        counter = counter + 1
        await awsClient._deleteRequest("pn-PaperRequestError", requestId, created)
        console.log("Element " + requestId + " with timestamp " + created + " removed")
      }
    }
    else {
      console.log("Element " + requestId + " corresponding notification has not yet been cancelled")
    }  
  }

  console.log("Total elements removed: " + counter)
}

main()