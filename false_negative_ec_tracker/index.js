const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require('../pn-common');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const path = require('path');

const CHANNEL_TYPE = ['email', 'pec', 'cartaceo']
const ANALOG_STATUS_REQUEST = ["RECRS006", "RECRN006", "RECAG004", "RECRI005", "RECRSI005", "RECRS013", "RECRN013", "RECAG013", "PN999"]

function appendJsonToFile(fileName, data){
  const pathResult = path.join(__dirname, 'results');
  if(!fs.existsSync(pathResult))
    fs.mkdirSync(pathResult, { recursive: true });
  fs.appendFileSync(`${pathResult}/${fileName}`, data + "\n")
}

function _checkStatusRequest(statusRequest) {
  console.log(`status request is ${statusRequest}`)
  return ANALOG_STATUS_REQUEST.indexOf(statusRequest.toUpperCase()) >= 0
}

function _checkingEventsList(eventsList, type) {
  let map;  
  if(type == 'pec') {
    map = {
      booked: false,
      sent: false,
      accepted: false,
    }
    for(const e of eventsList ) {
      map[e.digProgrStatus.status] = true
    }
    if( 'delivered' in map || 'notDelivered' in map){
      console.log(map)
      for(const param in map) {
        if (!map[param]) {
          return false
        }
      }
    }
    else {
      return false
    }
    return true;
  }
  else if (type == 'email') {
    map = {
      booked: false,
      sent: false
    }
    for(const e of eventsList ) {
      map[e.digProgrStatus.status] = true
    }
    console.log(map)
    for(const param in map) {
      if (!map[param]) {
        return false
      }
    }
    return true
  }
}

function _checkChannelType(channelType) {
  console.log(`Channel type choose: ${channelType}`)
  if(CHANNEL_TYPE.includes(channelType)) {
    console.log(`Script execution on ${channelType} channel`)
    return true
  }
  console.log(`Wrong channel type, insert one of ${CHANNEL_TYPE}`)
  process.exit(1)
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --channelType <channel-type>"
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
    { name: "channelType", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, channelType },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "p", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
      channelType: {
        type: "string", short: "c", default: undefined
      }
    },
  });  
  
  _checkingParameters(args, values)
  let queueUrls = [];
  const awsClient = new AwsClientsWrapper('confinfo', envName)
  awsClient._initSQS()
  awsClient._initDynamoDB()

  if(channelType) {
    console.log(channelType)
    _checkChannelType(channelType)
    const queueUrl = await awsClient._getQueueUrl(`pn-ec-tracker-${channelType}-errori-queue-DLQ.fifo`);
    queueUrls.push(queueUrl);
  }

  console.log('Preparing data...')

  console.log('Reading from file...')
  let requestIdsMap = {}
  const fileRows = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' })).filter(x=>x != '')
  for( let i = 0; i < fileRows.length; i++ ){
    const fileData = JSON.parse(JSON.stringify(fileRows[i]))
    const body = JSON.parse(fileData.Body)
    
    const requestId = `${body.xpagopaExtchCxId}~${body.requestIdx}`
    if (!requestIdsMap[requestId]) {
      requestIdsMap[requestId] = []
    } 
    requestIdsMap[requestId].push(JSON.stringify(fileData))
  }
  for ( const requestId in requestIdsMap ) {
    const res = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", requestId)
    if(res.Items.length > 0) {
      const metadata = unmarshall(res.Items[0])
      if(channelType=='cartaceo') {
        if(_checkStatusRequest(metadata.statusRequest)) {
          for(const row of requestIdsMap[requestId]) {
            appendJsonToFile(`to_remove_tracker_${channelType}.json`, row)
            console.log("to remove", requestId)
          }
        }
        else {
          console.log("to keep", requestId)
        }
      }
      else {
        if(_checkingEventsList(metadata.eventsList, channelType)) {
          for(const row of requestIdsMap[requestId]) {
            appendJsonToFile(`to_remove_tracker_${channelType}.json`, row)
            console.log("to remove", requestId)
          }
        }
        else {
          console.log("to keep", requestId)
        }
      }
    }
    else {
      console.log(`ERROR: requestId ${requestId} not found!`)
    }

  }
}

main();