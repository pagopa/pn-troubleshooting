const { AwsClientsWrapper } = require("pn-common");
const { _getIunFromRequestId, _getAttemptFromRequestId } = require("pn-common/libs/utils");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function _hasSpecificAttemptAnalogFeedbackEvent(timelineEvents, attempt) {
  let tmp = []
  timelineEvents.forEach(tlEvent => {
    if(tlEvent.timelineElementId.S.startsWith("SEND_ANALOG_FEEDBACK") && tlEvent.timelineElementId.S.includes(`ATTEMPT_${attempt}`)) {
      tmp.push(unmarshall(tlEvent))
    }
  });
  if(tmp.length > 0) {
    return true;
  }
  return false;
}

function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --fileName <fileName> --statusCode <statusCode> [--dryrun]"
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

function _prepareMessage(requestId, event) {
  const message = {
    digitalCourtesy: null,
    digitalLegal: null,
    clientId: "pn-cons-000",
    eventTimestamp: new Date().toISOString(),
    analogMail: {
      requestId: requestId,
      registeredLetterCode: event.registeredLetterCode,
      productType: event.productType,
      iun: event.iun,
      statusCode: event.statusCode,
      statusDescription: event.statusDescription,
      statusDateTime: event.statusDateTime,
      deliveryFailureCause: event.deliveryFailureCause,
      attachments: event.attachments,
      discoveredAddress: event.discoveredAddress,
      clientRequestTimeStamp: event.clientRequestTimeStamp
    },
  }
  return message

}

function appendJsonToFile(filePath, fileName, data){
  const path = `results/${filePath}`
  if(!fs.existsSync(path))
    fs.mkdirSync(path, { recursive: true });
  fs.appendFileSync(`${path}/${fileName}`, data + "\n")
}


async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "statusCode", mandatory: true, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, statusCode, dryrun },
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
      dryrun: {
        type: "boolean", short: "d", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  //INIT AWS
  const awsCoreClient = new AwsClientsWrapper( 'core', envName );
  const awsConfinfoClient = new AwsClientsWrapper( 'confinfo', envName );
  awsCoreClient._initDynamoDB();
  awsCoreClient._initSQS();
  awsConfinfoClient._initDynamoDB();
  const db = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  const queueUrl = await awsCoreClient._getQueueUrl("pn-external_channel_to_paper_channel");
  const date = new Date().toISOString();
  const chunkSize = 2500;
  const parser = []
  for (let i = 0; i < db.length; i += chunkSize) {
    const chunk = db.slice(i, i + chunkSize);
    parser.push(chunk)
  }
  for(const listPars of parser ) {
    for(const row of listPars ) {
      const requestId = row.split(',')[0]
      const statusDateTime = row.split(',')[1]
      console.log("elaborating request id: " + requestId)
      const iun = _getIunFromRequestId(requestId);
      const attempt = _getAttemptFromRequestId(requestId)
      let timelineEvents = await awsCoreClient._queryRequest("pn-Timelines", "iun", iun)
      if(!_hasSpecificAttemptAnalogFeedbackEvent(timelineEvents.Items, attempt)) {
        const metadati = (await awsConfinfoClient._queryRequest("pn-EcRichiesteMetadati", 'requestId', "pn-cons-000~" + requestId));
        const eventsList = unmarshall(metadati.Items[0]).eventsList
        const idxResult = eventsList
          .map((e, idx) => ({ e, idx }))
          .filter(({ e }) => e.paperProgrStatus.statusCode == statusCode && e.paperProgrStatus.statusDateTime == statusDateTime )
          .map(({ idx }) => idx);
        if(idxResult.length > 0) {
          console.log(`StatusCode ${statusCode} found for requestID: " + ${requestId}`)
          let messages = []
          let event = null;
          for(let i of idxResult) {
            event = _prepareMessage(requestId, eventsList[i].paperProgrStatus)
            messages.push(event)
          }
          if(!dryrun){
            //await awsCoreClient._sendSQSMessage(queueUrl, event, 0);
            appendJsonToFile(`${envName}_${date}`, `sentToSQS.json`, JSON.stringify({
              [requestId]: messages,
            }))
          }
        }
        else {
          appendJsonToFile(`${envName}_${date}`, `skipped.json`,  requestId)
          console.log(`No ${statusCode} found for requestID: " + ${requestId}`)
        }
      }
      else {
        console.log("Found SEND_ANALOG_FEEDBACK for requestID: " + requestId)
        appendJsonToFile(`${envName}_${date}`, `analogFeedback_.json`, requestId)
      }
    }
  }
}

main();