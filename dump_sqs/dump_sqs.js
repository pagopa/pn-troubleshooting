const AWS = require('aws-sdk');
const fs = require('fs');
const { parseArgs } = require('util');

const args = [
  { name: "awsProfile", mandatory: true, subcommand: [] },
  { name: "queueName", mandatory: true, subcommand: [] },
  { name: "visibilityTimeout", mandatory: false, subcommand: [] },
  { name: "format", mandatory: false, subcommand: [] },
  { name: "remove", mandatory: false, subcommand: [] },
  { name: "limit", mandatory: false, subcommand: [] }
]

const values = {
  values: { awsProfile, queueName, format, visibilityTimeout, remove, limit },
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
    },
    remove: {
      type: "boolean",
      default: false
    },
    limit: {
      type: "string",
      short: "l",
      default: "undefined"
    },
  },
});

function _checkingParameters(args, values){
  const usage = "Usage: node dump_sqs.js --awsProfile <aws-profile> --queueName <queue-name> --visibilityTimeout <visibility-timeout> [--format <output-format> --limit <limit-value> --remove]"
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


async function _writeInFile(result) {
  fs.mkdirSync("result", { recursive: true });
  const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  fs.writeFileSync('result/dump' +'_'+queueName+'_'+dateIsoString+'.json', JSON.stringify(result, null, 4), 'utf-8')
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
        i = messages.length + i
        console.log(`Hai ricevuto ${i} messaggi dalla coda.`);
        messages.forEach(async (message) => {
          elementsElaborated.push(message)
        });
        if (i > limit){
          hasNext = false;
        }
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
    await _writeInFile(extraction)

    if (remove) {
      extraction.forEach(async (e) => {
        var params = {
          QueueUrl: queueData.QueueUrl,
          ReceiptHandle: e.ReceiptHandle
        };
        sqs.deleteMessage(params, function(err, data) {
          if (err) console.log("errore nell'eliminazione dell'evento: " + message) ;    
        });
      })
    }
  }
}

dumpSQS()