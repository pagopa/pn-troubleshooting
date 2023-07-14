const AWS = require('aws-sdk');
const fs = require('fs');

const arguments = process.argv ;
  
if(arguments.length<=3){
  console.error("Specify AWS profile, DLQ name, SQS name and ID message to redrive as argument")
  console.log("node put_dlq_event_to_sqs.js <aws-profile> <DLQName> <SQSName> <MessageID>")
  process.exit(1)
}

const awsProfile = arguments[2]
const dlqName = arguments[3];  
const destinationQueueName = arguments[4];
const idMessage = arguments[5];  
let dlqUrl = null;
console.log("Using profile: "+ awsProfile)
if(!dlqName.includes("DLQ")){
  console.log("La campo DLQ fornito non è una DLQ: " + dlqName)
  return
}
console.log("Using DLQ Name: " + dlqName)
console.log("Using Destination Queue Name: " + destinationQueueName)
console.log("Using ID message: " + idMessage)

let credentials = null

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


async function sendMessageToSQS(message) {
  const destinationQueueParams = {
    QueueName: destinationQueueName
  };
  const destinationQueueData = await sqs.getQueueUrl(destinationQueueParams).promise();
  const destinationQueueUrl = destinationQueueData.QueueUrl;
  //START PREPARE ATTRIBUTES
  Object.keys(message.MessageAttributes).forEach((att)=> {
    if(message.MessageAttributes[att].BinaryListValues.length == 0)
      delete message.MessageAttributes[att].BinaryListValues
    if(message.MessageAttributes[att].StringListValues.length == 0)
      delete message.MessageAttributes[att].StringListValues
  })
  //END PREPARE ATTRIBUTES
  const jsonObject = [{
    Id: message.MessageId,
    MessageBody: message.Body,
    MessageAttributes: message.MessageAttributes
  }]
  console.log(jsonObject)
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
  let maxNumberOfMessages = 10;
  if(dlqName.includes(".fifo")) {
    maxNumberOfMessages = 1
  }
  const params = {
    QueueUrl: dlqUrl,
    MaxNumberOfMessages: maxNumberOfMessages, // Numero massimo di messaggi da recuperare (modificabile) ma deve essere 1 per code FIFO
    AttributeNames: ['All'],
    MessageAttributeNames: ['All'],
    VisibilityTimeout: 360,    // Tempo in secondi di non visibilità del messaggio dalla DLQ
    WaitTimeSeconds: 5,
  };
  try {
    let hasNext = true;
    while (hasNext) {
      const response = await sqs.receiveMessage(params).promise();
      const messages = response.Messages;
      if (messages && messages.length > 0) {
        console.log(`Hai ricevuto ${messages.length} messaggi dalla DLQ.`);
        messages.forEach((message) => {
          if(idMessage == "ALL"){
            sendMessageToSQS(message)
          }
          else if(message.MessageId == idMessage){
            console.log("Messaggio individuato. REDRIVE in corso")
            sendMessageToSQS(message)
            hasNext = false;
          }
        });
      } else {
        hasNext = false;
        console.log('La DLQ è vuota.');
      }
    }
    
  } catch (error) {
    console.error('Errore durante la ricezione dei messaggi dalla DLQ:', error);
  }
}

redriveMessagefromDLQ()