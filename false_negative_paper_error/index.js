const { AwsClientsWrapper } = require("./lib/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb")

function _checkStatusRequest(statusRequest) {
  console.log("status request is " + statusRequest)
  let statusRequests = ["RECRS006", "RECRN006", "RECAG004", "RECRI005", "RECRSI005", "RECRS013", "RECRN013", "RECAG013", "PN999"]
  if (statusRequests.indexOf(statusRequest)) {
    return true;
  }
  return false;
}
function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--dryrun]"
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
        type: "string", short: "p", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
      dryrun: {
        type: "boolean", short: "d", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  
  console.log('Preparing data...')
  const queueUrl = await awsClient._getQueueUrl('pn-ec-tracker-cartaceo-errori-queue-DLQ.fifo');

  console.log('Reading from file...')

  const fileRows = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }))
  let requestIdsMap = {};
  let nRemoved = 0;
  for( let i = 0; i < fileRows.length; i++ ){
    console.log(fileRows[i])
    const fileData = JSON.parse(JSON.stringify(fileRows[i]))
    const body = JSON.parse(fileData.Body)
    if (!requestIdsMap[body.xpagopaExtchCxId + "~" + body.requestIdx]) {
      requestIdsMap[body.xpagopaExtchCxId + "~" + body.requestIdx] = []
    } 
    requestIdsMap[body.xpagopaExtchCxId + "~" + body.requestIdx].push(fileData.ReceiptHandle)
  }
  for ( const requestId in requestIdsMap ) {
    console.log("For requestId " + requestId + " there are " + requestIdsMap[requestId].length + " elements")
    const res = await awsClient._queryRequest("pn-EcRichiesteMetadati", requestId)
    const metadati = unmarshall(res[0])
    if(_checkStatusRequest(metadati.statusRequest)) {
      if(dryrun) {
        console.log("DRY RUN mode active!!!")
        console.log("Removing all messages with requestId: " + requestId )
      } else {
        nRemoved += requestIdsMap[requestId].length
        console.log("Removing all messages with requestId: " + requestId )
        for ( const receiptHandle of requestIdsMap[requestId] ) {
          awsClient._deleteFromQueueMessage(queueUrl, receiptHandle)
        }
      } 
    }
    else {
      console.log('Nothing to do for requestId: ' + requestId )
    }
  }
  console.log("N° " + nRemoved + " messages removed")
}

main()