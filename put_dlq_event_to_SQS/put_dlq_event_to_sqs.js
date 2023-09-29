const AWS = require('aws-sdk');
const fs = require('fs');
const { parseArgs } = require('util');

const args = [
  { name: "awsProfile", mandatory: true, subcommand: [] },
  { name: "dlqName", mandatory: true, subcommand: [] },
  { name: "destinationQueueName", mandatory: false, subcommand: [] },
  { name: "idMessage", mandatory: true, subcommand: [] },
  { name: "redrive", mandatory: false, subcommand: [] },
]

const values = {
  values: { awsProfile, dlqName, destinationQueueName, idMessage, redrive },
} = parseArgs({
  options: {
    awsProfile: {
      type: "string",
      short: "a"
    },
    dlqName: {
      type: "string",
      short: "d"
    },
    destinationQueueName: {
      type: "string",
      short: "q"
    },
    idMessage: {
      type: "string",
      short: "i"
    },
    redrive: {
      type: "boolean", 
      short: "b", 
      default: false
    }
  },
});

function _checkingParameters(args, values){
  const usage = "Usage: node put_dlq_event_to_sqs.js --awsProfile <aws-profile> --dlqName <DLQName> --destinationQueueName <SQSName> --idMessage <MessageID> [--redrive]"
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

console.log("Using DLQ Name: " + dlqName)
console.log("Using Destination Queue Name: " + destinationQueueName)
console.log("Using ID message: " + idMessage)

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

async function sendMessageToSQS(message) {
  const destinationQueueParams = {
    QueueName: destinationQueueName
  };
  const destinationQueueData = await sqs.getQueueUrl(destinationQueueParams).promise();
  const destinationQueueUrl = destinationQueueData.QueueUrl;
  let jsonObject = null;
  if(dlqName.includes(".fifo")) {
    jsonObject = [{
      Id: message.MessageId,
      MessageBody: message.Body,
      MessageGroupId: message.Attributes.MessageGroupId,
      MessageDeduplicationId: message.Attributes.MessageDeduplicationId
    }]
  }
  else{
    jsonObject = [{
      Id: message.MessageId,
      MessageBody: message.Body,
      MessageAttributes: message.Attributes
    }]
  }
  const sendParams = {
    QueueUrl: destinationQueueUrl,
    Entries: jsonObject,
  };
  sqs.sendMessageBatch(sendParams, (err, data) => {
    if (err) {
      console.error('Errore durante l\'invio del messaggio:', err);
      return;
    }

    console.log('Messaggio inviato alla coda di destinazione con successo.');
    elementsElaborated.push(message)
    const deleteParams = {
      QueueUrl: dlqUrl,
      Entries: [{
        Id: message.MessageId,
        ReceiptHandle: message.ReceiptHandle,
      }],
    };
    sqs.deleteMessageBatch(deleteParams, (err, data) => {
      if (err) {
        console.error('Errore durante l\'eliminazione del messaggio dalla DLQ di origine:', err);
        return;
      }
      console.log('Messaggio eliminato dalla DLQ di origine con successo.');
    });
  })
}

async function redriveMessagefromDLQ() {
  const dlqQueueParams = {
    QueueName: dlqName
  };
  const dlqQueueData = await sqs.getQueueUrl(dlqQueueParams).promise();
  dlqUrl = dlqQueueData.QueueUrl;
  let maxNumberOfMessages = dlqName.includes(".fifo") ? 1: 10;
  const params = {
    QueueUrl: dlqUrl,
    MaxNumberOfMessages: maxNumberOfMessages, // Numero massimo di messaggi da recuperare (modificabile) ma deve essere 1 per code FIFO
    AttributeNames: ['All'],
    MessageAttributeNames: ['All'],
    VisibilityTimeout: 20,    // Tempo in secondi di non visibilità del messaggio dalla DLQ
    WaitTimeSeconds: 5,
  };
  try {
    let hasNext = true;

    let i = 0;
    while (hasNext) {
      console.log(i + " chiamata")
      const response = await sqs.receiveMessage(params).promise();
      const messages = response.Messages;
      if (messages && messages.length > 0) {
        console.log(`Hai ricevuto ${messages.length} messaggi dalla DLQ.`);
        
        messages.forEach(async (message) => {
          console.log(message)
          i = i+1
          console.log(i)
          if (redrive) {
            console.log("REDRIVE")
            if(idMessage == "ALL" && message.hasOwnProperty("Attributes")){
              await sendMessageToSQS(message)
            }
            else if(message.MessageId == idMessage){
              console.log("Messaggio individuato. REDRIVE in corso")
              await sendMessageToSQS(message)
              hasNext = false;
            }
          }
          else {
            elementsElaborated.push(message)
          } 
        });
      } else {
        hasNext = false;
        console.log('La DLQ è vuota.');
      }
    }
    
  } catch (error) {
    console.error('Errore durante la ricezione dei messaggi dalla DLQ:', error);
  } finally {
    console.log("NUMBER OF MESSAGE: " + elementsElaborated.length)
    let extraction = [] 
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
    console.log("NUMBER OF MESSAGE: " + extraction.length)
    await _writeInFile(extraction, "ElaboratedMessages")
  }
}

redriveMessagefromDLQ()