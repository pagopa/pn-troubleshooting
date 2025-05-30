const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');

function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync("results/" + fileName, data + "\n")
}

function prepareSqsMessage(iun, data){
  return {
    MessageAttributes: {
      createdAt: data,
      eventId: `${iun}_notification_viewed_rec0`,
      eventType: "NOTIFICATION_VIEWED",
      iun: iun,
      publisher: "DELIVERY"
    },
    Body: {
      iun: iun,
      recipientIndex:0
    }
  }
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> [--visibilityTimeout <visibility-timeout>] [--dryrun]"
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
    { name: "fileName", mandatory: true, subcommand: [] }

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
      }
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initCloudwatch()
  const iunsMap = new Map()
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const timestamp = fileRows[i].split(",")[1]
    const iun = fileRows[i].split(",")[0]
    if(!iunsMap.has(iun)) {
      iunsMap.set(iun, false)
    }
    else if(iunsMap.get(iun)){
      continue
    }
    const endTimestamp = Date.parse(timestamp);
    const startTimestamp = endTimestamp - (5*60*1000)
    const queryString = `filter @message like "payload=PnDeliveryNotificationViewedEvent.Payload(iun=${iun}"`
    const logs = await awsClient._executeCloudwatchQuery(['/aws/ecs/pn-delivery-push'], startTimestamp, endTimestamp, queryString, 1)
    if (logs && logs.length > 0) {
      logs.forEach(log => {
        log.forEach(element => {
          if(element.field == '@message') {
            const createdAt = JSON.parse(element.value).message.split('createdAt={StringValue: ')[1].split(',')[0]
            iunsMap.set(iun, createdAt)
          }
        });
      });
    }
  }
  for (let [key, value] of  iunsMap.entries()) {
    if(value) {
      const sqsMessage = prepareSqsMessage(key, value)
      appendJsonToFile("output.json", JSON.stringify(sqsMessage))
    }
    else {
      appendJsonToFile("error.txt", `${key} not found`)
    }
  }
}

main();