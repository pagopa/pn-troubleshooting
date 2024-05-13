const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const headersVerifyOrDelete = ["requestId", "iun", "paId", "registeredLetterCode","statusCodeDLQ","deliveryFailureCauseDLQ","businessDateTimeDLQ", "eventDateTimeDLQ", "statusCodeTL","deliveryFailureCauseTL", "businessDateTimeTL", "eventDateTimeTL"]
const headersRedrive = ["requestId", "statusCodeDLQ"]

function appendJsonToFile(fileName, data){
  const resultPath = path.join(__dirname, "result")
  if(!fs.existsSync(resultPath))
    fs.mkdirSync(resultPath, { recursive: true });
  if(!fs.existsSync(resultPath + "/" + fileName))
    if(fileName.startsWith('to_verify') || fileName.startsWith('to_delete')) {
      fs.appendFileSync(resultPath + "/" + fileName, headersVerifyOrDelete.join(",") +"\n")
    }
    else {
      fs.appendFileSync(resultPath + "/" + fileName, headersRedrive.join(",") +"\n")
    }
    
  fs.appendFileSync(resultPath + "/" + fileName, data + "\n")
}

function createReport(requestId, iun, paId, registeredLetterCode, statusCodeDLQ, deliveryFailureCauseDLQ, businessDateTimeDLQ, eventDateTimeDLQ, statusCodeTL, deliveryFailureCauseTL, businessDateTimeTL, eventDateTimeTL){
  return [requestId, iun, paId, registeredLetterCode, statusCodeDLQ, deliveryFailureCauseDLQ, businessDateTimeDLQ, eventDateTimeDLQ, statusCodeTL, deliveryFailureCauseTL, businessDateTimeTL, eventDateTimeTL].join(",")
}

function getFirstCElement(eventsList){
  let res = eventsList.filter(element => { 
    const statusCode = element.paperProgrStatus.statusCode
    return statusCode && statusCode.charAt(statusCode.length - 1) === 'C'
  }).reduce((latest, current) => {
    return new Date(latest.paperProgrStatus.clientRequestTimeStamp) > new Date(current.paperProgrStatus.clientRequestTimeStamp) ? current : latest;
  });
  return res
}

function verifyCompatibility(type, requestId, iun, paId, registeredLetterCode, statusCodeDLQ, deliveryFailureCauseDLQ, statusDateTimeDLQ, eventTimestamp, deliveryDetailCodeTL, deliveryFailureCauseTL, notificationDateTL, timestampTL){
  if(type == 'analog') {
    if(deliveryDetailCodeTL == statusCodeDLQ && deliveryFailureCauseTL == deliveryFailureCauseDLQ && new Date(statusDateTimeDLQ).toISOString() == new Date(notificationDateTL).toISOString()) {
      dryrun ? console.log("DRYRUN: " + requestId + " to remove") : console.log(requestId + " to remove")
      return true
    }
    else {
      console.log(requestId + " to verify")
      appendJsonToFile("to_verify.csv", createReport(requestId, iun, paId, registeredLetterCode, statusCodeDLQ, deliveryFailureCauseDLQ, statusDateTimeDLQ, eventTimestamp, deliveryDetailCodeTL, deliveryFailureCauseTL, notificationDateTL, timestampTL))
      return false
    }
  }
  else {
    if(deliveryDetailCodeTL == statusCodeDLQ && deliveryFailureCauseTL == deliveryFailureCauseDLQ && new Date(statusDateTimeDLQ).toISOString() == new Date(notificationDateTL).toISOString()) {
      dryrun ? console.log("DRYRUN: " + requestId + " to remove") : console.log(requestId + " to remove")
      return true
    }
    else {
      return false
    }
  }
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
      //TO REMOVE PATH
      let feedbackEvent = timelineEvents.find(x => x.timelineElementId.S == feedbackString)
      dlq_elem.deliveryFailureCause == "null" ? dlq_elem.deliveryFailureCause = null : null
      if(feedbackEvent) {
        feedbackEvent = unmarshall(feedbackEvent);
        if(feedbackEvent.details.deliveryDetailCode == "PNRN012") {
          let result = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", 'pn-cons-000~' + requestId, 'confinfo')
          if (result.Items.length>0) {
            metadata = unmarshall(result.Items[0]) 
            let firstCElement = getFirstCElement(metadata.eventsList)
            let toDelete = verifyCompatibility('analog', requestId, iun, feedbackEvent.paId, dlq_elem.registeredLetterCode, dlq_elem.statusCode, dlq_elem.deliveryFailureCause, dlq_elem.statusDateTime, body.eventTimestamp, firstCElement.paperProgrStatus.statusCode, firstCElement.paperProgrStatus.deliveryFailureCause, firstCElement.paperProgrStatus.statusDateTime, feedbackEvent.timestamp)
            if (toDelete) {
              appendJsonToFile("to_delete.csv", createReport(requestId, iun, feedbackEvent.paId, dlq_elem.registeredLetterCode, dlq_elem.statusCode, dlq_elem.deliveryFailureCause, dlq_elem.statusDateTime, body.eventTimestamp, firstCElement.paperProgrStatus.statusCode, firstCElement.paperProgrStatus.deliveryFailureCause, firstCElement.paperProgrStatus.statusDateTime, feedbackEvent.timestamp))
            }
            if(!dryrun) {
              await awsClient._deleteFromQueueMessage(queueUrl, JSON.parse(fileRows[i]).receiptHandle)
            }
          }
          else {
            console.log("RequestId not found " + requestId)
            continue
          }
        }
        else {
          let toDelete = verifyCompatibility('analog', requestId, iun, feedbackEvent.paId, dlq_elem.registeredLetterCode, dlq_elem.statusCode, dlq_elem.deliveryFailureCause, dlq_elem.statusDateTime, body.eventTimestamp, feedbackEvent.details.deliveryDetailCode, feedbackEvent.details.deliveryFailureCause, feedbackEvent.details.notificationDate, feedbackEvent.timestamp)
          if (toDelete) {
            appendJsonToFile("to_delete.csv", createReport(requestId, iun, feedbackEvent.paId, dlq_elem.registeredLetterCode, dlq_elem.statusCode, dlq_elem.deliveryFailureCause, dlq_elem.statusDateTime, body.eventTimestamp, feedbackEvent.details.deliveryDetailCode, feedbackEvent.details.deliveryFailureCause, feedbackEvent.details.notificationDate, feedbackEvent.timestamp))  
          }
          if(!dryrun) {
            await awsClient._deleteFromQueueMessage(queueUrl, JSON.parse(fileRows[i]).receiptHandle)
          }
        }
      }
      //TO REDRIVE PATH
      else {
        console.log(requestId + " to redrive")
        appendJsonToFile("to_redrive.csv", [requestId, dlq_elem.statusCode])
      }
    }
    else if (requestId.startsWith("PREPARE_SIMPLE")) {
      let progressString = "SEND_SIMPLE_REGISTERED_LETTER_PROGRESS.IUN_" + iun + requestId.split(iun)[1].split('.PCRETRY')[0]
      let simpleLetterProgressEvents = timelineEvents.filter(x => x.timelineElementId.S.startsWith(progressString))
      let toDelete = false;
      for(let z = 0; z < simpleLetterProgressEvents.length; z++) {
        let progressEvent = unmarshall(simpleLetterProgressEvents[z])
        toDelete = verifyCompatibility('simple', requestId, iun, progressEvent.paId, dlq_elem.registeredLetterCode, dlq_elem.statusCode, dlq_elem.deliveryFailureCause, dlq_elem.statusDateTime, body.eventTimestamp, progressEvent.details.deliveryDetailCode,  progressEvent.details?.deliveryFailureCause,  progressEvent.details.notificationDate, progressEvent.timestamp)
        if (toDelete) {
          appendJsonToFile("to_delete.csv", createReport(requestId, iun, progressEvent.paId, dlq_elem.registeredLetterCode, dlq_elem.statusCode, dlq_elem.deliveryFailureCause, dlq_elem.statusDateTime, body.eventTimestamp, progressEvent.details.deliveryDetailCode,  progressEvent.details?.deliveryFailureCause,  progressEvent.details.notificationDate, progressEvent.timestamp))
          if(!dryrun) {
            await awsClient._deleteFromQueueMessage(queueUrl, JSON.parse(fileRows[i]).receiptHandle)
          }
          break
        }
      }
      if(!toDelete) {
        console.log(requestId + " to redrive")
        appendJsonToFile("to_redrive.csv", [requestId, dlq_elem.statusCode])
      }
    }
  }
  console.log("End Execution")
}

main();