const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

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

function appendJsonToFile(fileName, jsonData){
  //fs.mkdirSync("results", { recursive: true });
  //fs.appendFileSync("results/" + fileName, JSON.stringify(jsonData) + "\n")
  console.log(JSON.stringify(jsonData))
}

async function hasFeedback(awsClient, requestId) {
  // pn-cons-000~PREPARE_ANALOG_DOMICILE.IUN_ZQZR-KLJL-WZJY-202309-R-1.RECINDEX_0.ATTEMPT_0.PCRETRY_0
  const iun = requestId.split("~")[1].split(".")[1]
  const timelineElements = await awsClient._queryRequest('pn-Timelines', 'iun', iun, null, 'core')
  const elementIdToSearch = requestId.split("~")[1].split('.PCRETRY_')[0].replace('PREPARE_ANALOG_DOMICILE', 'SEND_ANALOG_FEEDBACK')
  console.log('elementId to Search', elementIdToSearch)
  const element = timelineElements.Items.find(element => element.elementId.S === elementIdToSearch)

  if(element){
    return true;
  }

  return false;
}

const statusCodes = ['RECAG005C', 'RECAG006C', 'RECAG007C']

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
  const awsClient = new AwsClientsWrapper( envName );
  const requestIds = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  const batchSize = Math.floor( requestIds.length / (14*60));
  const sqsUrl = await awsClient._getQueueURL("pn-external_channel_to_paper_channel");
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
      /*if(batchSize > 1) {
        if(index%batchSize == 0) {
          delay++
        }
      }*/
    
      const feedback = await hasFeedback(awsClient, requestId)
      if(!feedback){

        const metadati = (await awsClient._queryRequest("pn-EcRichiesteMetadati", 'requestId', requestId, 'eventsList')).Items[0];
        const eventsList = unmarshall(metadati).eventsList
        const hasRecag011A = eventsList
          .find( (e) => e.paperProgrStatus.statusCode == 'RECAG011A')

        if(!hasRecag011A){
          console.log('Request id '+requestId+' has no RECAG011A events, skipping')
          continue
        }

        eventsList.sort((a, b) => {
          return a.paperProgrStatus.statusDateTime - b.paperProgrStatus.statusDateTime // check with Christian
        })

        const eventsByStatusCode = {}

        for(let i=0; i<statusCodes.length; i++){
          const statusCode = statusCodes[i]
          // search statusCode in eventsList
          const event = eventsList
            .find( (e) => e.paperProgrStatus.statusCode == statusCode)
          
          if(event){
            eventsByStatusCode[statusCode] = event
          }
        }

        if(Object.keys(eventsByStatusCode).length === 0){
          console.log('Request id '+requestId+' hasn\'t any status codes, skipping')
          continue
        }

        if(Object.keys(eventsByStatusCode).length > 1){
          console.log('Request id '+requestId+' has mixed status codes, skipping')
          continue
        }

        const key = Object.keys(eventsByStatusCode)[0]
        console.log('Request id '+requestId+' has event with status code '+key)

        const message = _prepareMessage(requestId.replace('pn-cons-000~', ''), eventsByStatusCode[key].paperProgrStatus)
        if(!dryrun){
          await awsClient._sendSQSMessage(sqsUrl, message, delay);
        }

        console.log('Request id '+requestId+' message sent to SQS', message)
        index = index + 1;        
      } else {
        console.log('Request id '+requestId+' has already feedback, skipping')
      }

      
    }
  }
}

main();