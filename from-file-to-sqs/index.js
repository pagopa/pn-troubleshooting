const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');
const AwsClientWrapperWithRegion  = require("./libs/AwsClientWrapperWithRegion");

function prepareMessageAttributes(attributes) {
  let att = {}
  if(attributes != null) {
    Object.keys(attributes).forEach(k => {
      att[k] = attributes[k]
    });
  }
  return att;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --outputQueue <output-queue>] [--dryrun]"
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
    { name: "region", mandatory: false, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "outputQueue", mandatory: true, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] },

  ]
  const values = {
    values: { envName, region, fileName, outputQueue, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      region: {
        type: "string", short: "r", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      outputQueue: {
        type: "string", short: "q", default: undefined
      },
      dryrun: {
        type: "boolean", short: "n", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientWrapperWithRegion( 'core', envName, region );
  awsClient._initSQS()
  const queueUrl = await awsClient._getQueueUrl(outputQueue);
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const event = JSON.parse(fileRows[i])
    const messageAttributes = prepareMessageAttributes(event.MessageAttributes)
    let messageDeduplicationId
    let messageGroupId
    if(outputQueue.endsWith('fifo')) {
      messageDeduplicationId = `${crypto.randomUUID()}-${i}`
      messageGroupId = event.MessageAttributes.eventId.StringValue
    }
    if(!dryrun) {
      const eventBody = JSON.parse(event.Body)
      console.log(`Sending message`, eventBody)
      await awsClient._sendSQSMessage(queueUrl, eventBody, 0, messageAttributes, messageGroupId, messageDeduplicationId)
    }
    else {
      console.log(`DRYRUN: Sending message ${JSON.stringify(event.Body)}`)
    }
  }
}

main();