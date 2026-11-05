const { AwsClientsWrapper } = require("pn-common");
const { _getIunFromRequestId, _getAttemptFromRequestId, _parseCSV } = require("pn-common/libs/utils");
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
  const usage = "Usage: index.js --envName <envName> --fileName <fileName> [--statusCode <statusCode>] [--dryrun]"
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

async function _readRequests(fileName, statusCode) {
  const content = fs.readFileSync(fileName, 'utf8').replace(/^\uFEFF/, '');
  const isCsv = /^"?requestid"?\s*;/i.test(content.trimStart());
  let requests;
  if (isCsv) {
    const rows = await _parseCSV(fileName, ';', {
      bom: true,
      skip_empty_lines: true,
      columns: headers => {
        for (const name of ['requestid', 'fine_recapito_stato_silver', 'fine_recapito_data_silver']) {
          if (!headers.includes(name)) {
            throw new Error(`Missing CSV column: ${name}`);
          }
        }
        return headers;
      }
    });
    requests = rows.map(row => ({
      requestId: row.requestid,
      statusCode: row.fine_recapito_stato_silver,
      statusDateTime: row.fine_recapito_data_silver
    }));
  } else {
    if (!statusCode) {
      throw new Error('--statusCode is required for input without CSV status columns');
    }
    requests = content.split(/\r?\n/).filter(line => line.trim() !== '').map((line, index) => {
      const fields = line.split(',').map(field => field.trim());
      if (fields.length !== 2) {
        throw new Error(`Invalid input record ${index + 1}: expected requestId,timestamp`);
      }
      return { requestId: fields[0], statusCode, statusDateTime: fields[1] };
    });
  }
  if (requests.length === 0) {
    throw new Error('Input file contains no requests');
  }
  requests.forEach((request, index) => {
    if (!request.requestId || !request.statusCode || !request.statusDateTime ||
        !Number.isFinite(Date.parse(request.statusDateTime))) {
      throw new Error(`Invalid input record ${index + 1}: requestId, statusCode and a valid timestamp are required`);
    }
  });
  return requests;
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
    { name: "statusCode", mandatory: false, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] }
  ]
  const values = parseArgs({
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
  const { envName, fileName, statusCode, dryrun } = values.values;
  const requestIds = await _readRequests(fileName, statusCode);
  //INIT AWS
  const awsCoreClient = new AwsClientsWrapper( 'core', envName );
  const awsConfinfoClient = new AwsClientsWrapper( 'confinfo', envName );
  awsCoreClient._initDynamoDB();
  awsCoreClient._initSQS();
  awsConfinfoClient._initDynamoDB();
  const queueUrl = await awsCoreClient._getQueueUrl("pn-external_channel_to_paper_channel");
  const date = new Date().toISOString();
  const counts = { sent: 0, dryrun: 0, noMatch: 0, differentDates: 0, feedback: 0 };
  let processed = 0;
  console.log(`[START] env=${envName} requests=${requestIds.length} dryrun=${dryrun} results=results/${envName}_${date}`);
  const chunkSize = 2500;
  const parser = []
  for (let i = 0; i < requestIds.length; i += chunkSize) {
    const chunk = requestIds.slice(i, i + chunkSize);
    parser.push(chunk)
  }
  for(const listPars of parser ) {
    for(const params of listPars ) {
      const { requestId, statusDateTime, statusCode } = params;
      const logContext = `[${++processed}/${requestIds.length}] requestId=${requestId} status=${statusCode} date=${statusDateTime}`;
      const iun = _getIunFromRequestId(requestId);
      const attempt = _getAttemptFromRequestId(requestId)
      let timelineEvents = await awsCoreClient._queryRequest("pn-Timelines", "iun", iun)
      if(!_hasSpecificAttemptAnalogFeedbackEvent(timelineEvents.Items, attempt)) {
        const metadati = (await awsConfinfoClient._queryRequest("pn-EcRichiesteMetadati", 'requestId', "pn-cons-000~" + requestId));
        const eventsList = unmarshall(metadati.Items[0]).eventsList
        const idxResult = eventsList
          .map((e, idx) => ({ e, idx }))
          .filter(({ e }) => e.paperProgrStatus.statusCode == statusCode && Date.parse(e.paperProgrStatus.statusDateTime) === Date.parse(statusDateTime))
          .map(({ idx }) => idx);
        if(idxResult.length > 0) {
          let messages = []
          let event = null;
          let skip = false;
          for(let i of idxResult) {
            const message = _prepareMessage(requestId, eventsList[i].paperProgrStatus)
            event == null ? event = message : null
            event.analogMail.clientRequestTimeStamp < message.analogMail.clientRequestTimeStamp ? event = message : null
            messages.push(message)
            skip = Date.parse(messages[0].analogMail.statusDateTime) !== Date.parse(eventsList[i].paperProgrStatus.statusDateTime)
          }
          if(!dryrun && !skip){
            await awsCoreClient._sendSQSMessage(queueUrl, event, 0);
          }
          const res = {
            [requestId]: messages,
          }
          if(!skip) {
            appendJsonToFile(`${envName}_${date}`, `sentToSQS.json`, JSON.stringify(res))
            counts[dryrun ? 'dryrun' : 'sent']++;
            console.log(`${logContext} ${dryrun ? 'DRYRUN would-send' : 'SENT'}`);
          }
          else {
            appendJsonToFile(`${envName}_${date}`, `skipped.json`, JSON.stringify(res))
            counts.differentDates++;
            console.log(`${logContext} SKIP different-dates`);
          }
        }
        else {
          appendJsonToFile(`${envName}_${date}`, `skipped.json`, JSON.stringify({ [requestId]: [] }))
          counts.noMatch++;
          console.log(`${logContext} SKIP no-matching-event`);
        }
      }
      else {
        appendJsonToFile(`${envName}_${date}`, `analogFeedback_.json`, requestId)
        counts.feedback++;
        console.log(`${logContext} SKIP feedback-already-present`);
      }
    }
  }
  console.log(`[DONE] total=${processed} sent=${counts.sent} dryrun=${counts.dryrun} skipped=${counts.noMatch + counts.differentDates + counts.feedback} (no-match=${counts.noMatch}, different-dates=${counts.differentDates}, feedback=${counts.feedback})`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { _readRequests };