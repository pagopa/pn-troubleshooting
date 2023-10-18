const AWS = require('aws-sdk');
const fs = require('fs');
const { parseArgs } = require('util');

const args = [
  { name: "awsProfile", mandatory: true, subcommand: [] },
  { name: "queueName", mandatory: true, subcommand: [] },
  { name: "visibilityTimeout", mandatory: false, subcommand: [] },
  { name: "format", mandatory: false, subcommand: [] }
]

const values = {
  values: { awsProfile, queueName, format, visibilityTimeout },
} = parseArgs({
  options: {
    awsProfile: {
      type: "string",
      short: "a"
    },
    queueName: {
      type: "string",
      short: "q"
    },
    visibilityTimeout: {
      type: "string",
      short: "t",
      default: "20"
    },
    format: {
      type: "string",
      short: "f",
      default: "raw"
    }
  },
});

function _checkingParameters(args, values){
  const usage = "Usage: node dump_sqs.js --awsProfile <aws-profile> --queueName <queue-name> --visibilityTimeout <visibility-timeout> [--format <output-format>]"
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

_checkingParameters(args, values)

console.log("Using DLQ Name: " + queueName)
console.log("Using Format: " + format)

let credentials = null
var elementsElaborated = []

process.env.AWS_SDK_LOAD_CONFIG=1
if(awsProfile.indexOf('sso_')>=0){ // sso profile
  credentials = new AWS.SsoCredentials({profile:awsProfile});
  AWS.config.credentials = credentials;
} else { // IAM profile
  credentials = new AWS.SharedIniFileCredentials({profile: awsProfile});
  AWS.config.credentials = credentials;
}
AWS.config.update({region: 'eu-south-1'});

const sqs = new AWS.SQS();


async function _writeInFile(result, filename ) {
  fs.mkdirSync("result", { recursive: true });
  fs.writeFileSync('result/' + filename+'.json', JSON.stringify(result, null, 4), 'utf-8')
}

async function dumpSQS() {
  const queueParams = {
    QueueName: queueName
  };
  const queueData = await sqs.getQueueUrl(queueParams).promise();
  let maxNumberOfMessages = queueName.includes(".fifo") ? 1: 10;
  const params = {
    QueueUrl: queueData.QueueUrl,
    MaxNumberOfMessages: maxNumberOfMessages, // Numero massimo di messaggi da recuperare (modificabile) ma deve essere 1 per code FIFO
    AttributeNames: ['All'],
    MessageAttributeNames: ['All'],
    VisibilityTimeout: parseInt(visibilityTimeout),    // Tempo in secondi di non visibilità del messaggio dalla DLQ
    WaitTimeSeconds: 5,
  };
  try {
    let hasNext = true;

    let i = 0;
    while (hasNext) {
      const response = await sqs.receiveMessage(params).promise();
      const messages = response.Messages;
      if (messages && messages.length > 0) {
        console.log(`Hai ricevuto ${messages.length} messaggi dalla coda.`);
        
        messages.forEach(async (message) => {
          elementsElaborated.push(message)
        });
      } else {
        hasNext = false;
        console.log('La coda è vuota.');
      }
    }
    
  } catch (error) {
    console.error('Errore durante la ricezione dei messaggi dalla coda:', error);
  } finally {
    console.log("NUMBER OF MESSAGES: " + elementsElaborated.length)
    let extraction = [] 
    if(format==='ss'){
      elementsElaborated.forEach(x => {
        console.log(JSON.parse(x.Body))
        let parsedItem = JSON.parse(x.Body).Records 
        parsedItem.forEach( y=> {
          var obj = {
            "eventName": y.eventName,
            "eventSource": y.eventSource,
            "eventTime": y.eventTime,
            "s3": y.s3,
          }
          extraction.push(obj)
        })
      })
    } else {
      extraction = elementsElaborated
    }
    console.log("NUMBER OF MESSAGE: " + extraction.length)
    await _writeInFile(extraction, "ElaboratedMessages")
  }
}

dumpSQS()