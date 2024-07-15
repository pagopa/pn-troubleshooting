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
  const usage = "Usage: index.js --envName <envName> --fileName <fileName> [--dryrun]"
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

function sleep(ms) {
  return new Promise(resolve => {
    console.log("Sleep for " + ms / 60 / 1000 + "minutes at " + new Date().toISOString())
    setTimeout(resolve, ms)
  });

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

function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync(`results/${fileName}`, JSON.stringify(data) + "\n")
}


async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
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
  const requestIds = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  const batchSize = Math.floor( requestIds.length / (14*60));
  const queueUrl = await awsCoreClient._getQueueUrl("pn-external_channel_to_paper_channel");
  const date = new Date().toISOString();
  let index = 0;
  const chunkSize = 2500;
  const parser = []
  for (let i = 0; i < requestIds.length; i += chunkSize) {
    const chunk = requestIds.slice(i, i + chunkSize);
    parser.push(chunk)
  }
  for(const listPars of parser ) {
    let delay = 0;
    if(index != 0) {
      await sleep(15*60*1000)
      console.log("Ready to next! " + new Date().toISOString())
    }
    for(const requestId of listPars ) {
      console.log("elaborating request id: " + requestId)
      if(index%batchSize == 0) {
        delay++
      }
      const iun = _getIunFromRequestId(requestId);
      const attempt = _getAttemptFromRequestId(requestId)
      let timelineEvents = await awsCoreClient._queryRequest("pn-Timelines", "iun", iun)
      if(!_hasSpecificAttemptAnalogFeedbackEvent(timelineEvents.Items, attempt)) {
        const metadati = (await awsConfinfoClient._queryRequest("pn-EcRichiesteMetadati", 'requestId', "pn-cons-000~" + requestId, 'eventsList')).Items[0];
        const eventsList = unmarshall(metadati).eventsList
        const idxResult = eventsList
          .map((e, idx) => ({ e, idx }))
          .filter(({ e }) => e.paperProgrStatus.statusCode == 'RECAG012')
          .map(({ idx }) => idx);

        if(idxResult.length > 0) {
          let messages = []
          let event = null;
          for(let i of idxResult) {
            const message = _prepareMessage(requestId, eventsList[i].paperProgrStatus)
            event == null ? event = message : null
            event.analogMail.clientRequestTimeStamp < message.analogMail.clientRequestTimeStamp ? event = message : null
            messages.push(message)
          }
          if(!dryrun){
            await awsClient._sendSQSMessage(queueUrl, event, delay);
          }
          console.log(event)
          const res = {
            [requestId]: messages,
          }
          appendJsonToFile(`sentToSQS_${envName}_${date}.json`, res)
        }
        else {
          console.log("No RECAG012 found for requestID: " + requestId)
        }
        index = index + 1;
      }
      else {
        console.log("Found SEND_ANALOG_FEEDBACK for requestID: " + requestId)
        appendJsonToFile(`analogFeedback_${envName}_${date}.json`, res)
      }
    }
  }
}

main();