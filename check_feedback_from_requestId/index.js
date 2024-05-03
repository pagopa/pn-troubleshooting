const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const headers = ["requestId", "iun", "paId", "registeredLetterCode","statusCodeDLQ","deliveryFailureCauseDLQ","businessDateTimeDLQ", "eventDateTimeDLQ", "statusCodeTL","deliveryFailureCauseTL", "businessDateTimeTL", "eventDateTimeTL"]
function appendJsonToFile(fileName, data){
  const resultPath = path.join(__dirname, "result")
  if(!fs.existsSync(resultPath))
    fs.mkdirSync(resultPath, { recursive: true });
  if(!fs.existsSync(resultPath + "/" + fileName))
    fs.appendFileSync(resultPath + "/" + fileName, headers.join(",") +"\n")
  fs.appendFileSync(resultPath + "/" + fileName, data + "\n")
}

function createReport(requestId, iun, paId, registeredLetterCode, statusCodeDLQ, deliveryFailureCauseDLQ, businessDateTimeDLQ, eventDateTimeDLQ, statusCodeTL, deliveryFailureCauseTL, businessDateTimeTL, eventDateTimeTL){
  return [requestId, iun, paId, registeredLetterCode, statusCodeDLQ, deliveryFailureCauseDLQ, businessDateTimeDLQ, eventDateTimeDLQ, statusCodeTL, deliveryFailureCauseTL, businessDateTimeTL, eventDateTimeTL].join(",")
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
  const queueUrl = await awsClient._getQueueUrl('pn-external_channel_to_paper_channel-DLQ');
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const body =  JSON.parse(fileRows[i]).body
    const dlq_elem = body.analogMail
    const requestId = dlq_elem.requestId
    const iun = requestId.split('IUN_')[1].split('.')[0]   
    let result = await awsClient._queryRequest("pn-Timelines", "iun", iun)
    let timelineEvents = result.Items;
    if (requestId.startsWith("PREPARE_ANALOG_DOMICILE")) {
      feedbackString = "SEND_ANALOG_FEEDBACK.IUN_" + iun + requestId.split(iun)[1].split('.PCRETRY')[0]
    }
    //TO REMOVE PATH
    let feedbackEvent = timelineEvents.find(x => x.timelineElementId.S == feedbackString)
    if(feedbackEvent) {
      feedbackEvent = unmarshall(feedbackEvent);
      dlq_elem.deliveryFailureCause == "null" ? dlq_elem.deliveryFailureCause = null : null
      if(feedbackEvent.details.deliveryDetailCode == dlq_elem.statusCode && feedbackEvent.details.deliveryFailureCause == dlq_elem.deliveryFailureCause) {
        if (dryrun) {
          console.log("DRYRUN: " + requestId + " to remove")
        }
        else {
          console.log(requestId + " to remove")
          //await awsClient._deleteFromQueueMessage(queueUrl, JSON.parse(fileRows[i]).receiptHandle)
        }
      }
      else {
        console.log(requestId + " to verify")
        appendJsonToFile("to_verify.csv", createReport(requestId, iun, feedbackEvent.paId, dlq_elem.registeredLetterCode, dlq_elem.statusCode, dlq_elem.deliveryFailureCause, dlq_elem.statusDateTime, body.eventTimestamp, feedbackEvent.details.deliveryDetailCode, feedbackEvent.details.deliveryFailureCause, feedbackEvent.details.notificationDate, feedbackEvent.timestamp))
      }
    }
    //TO REDRIVE PATH
    else {
      console.log(requestId + " to redrive")
      appendJsonToFile("to_redrive.json", "{\"requestId\": \"" +requestId+ "\", \"statusCode\": \"" + dlq_elem.statusCode + "\"}")
    }
  }
  console.log("End Execution")
}

main();