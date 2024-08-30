const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const crypto = require('crypto');

function prepareMessageAttributes(attributes) {
  let att = {}
  Object.keys(attributes).forEach(k => {
    att[k] = attributes[k]
  });
  return att;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name>] [--dryrun]"
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
        type: "string", short: "f", default: undefined
      },
      dryrun: {
        type: "boolean", short: "n", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initSQS()
  const queueName = "pn-delivery_push_inputs-DLQ.fifo"
  const queueUrl = await awsClient._getQueueUrl(queueName);
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const event = JSON.parse(fileRows[i])
    const messageAttributes = prepareMessageAttributes(event.MessageAttributes)
    const messageDeduplicationId = `${crypto.randomUUID()}-${i}`
    const messageGroupId = event.MessageAttributes.eventId.StringValue
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