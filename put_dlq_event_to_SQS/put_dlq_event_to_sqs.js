const AWS = require('aws-sdk');
const fs = require('fs');

const args = ["awsprofile", "dlqName", "destinationQueueName", "idMessage"]
const values = {
  values: { awsProfile, dlqName, destinationQueueName, idMessage },
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
    }
  },
});

args.forEach(k => {
    if(!values.values[k]) {
      console.log("Parameter '" + k + "' is not defined")
      console.log("Usage: node put_dlq_event_to_sqs.js --awsProfile <aws-profile> --dlqName <DLQName> --destinationQueueName <SQSName> --idMessage <MessageID>")
      process.exit(1)
    }
  });

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
  //START PREPARE MESSAGE ATTRIBUTES
  if("MessageAttributes" in message) {
    Object.keys(message.MessageAttributes).forEach((att)=> {
      if(message.MessageAttributes[att].BinaryListValues.length == 0)
        delete message.MessageAttributes[att].BinaryListValues
      if(message.MessageAttributes[att].StringListValues.length == 0)
        delete message.MessageAttributes[att].StringListValues
    })
  }
  //END PREPARE MESSAGE ATTRIBUTES
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
      MessageAttributes: message.MessageAttributes
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
    VisibilityTimeout: 20,    // Tempo in secondi di non visibilità del messaggio dalla DLQ
    WaitTimeSeconds: 5,
  };
  try {
    let hasNext = true;
    while (hasNext) {
      const response = await sqs.receiveMessage(params).promise();
      const messages = response.Messages;
      if (messages && messages.length > 0) {
        console.log(`Hai ricevuto ${messages.length} messaggi dalla DLQ.`);
        let i = 0;
        messages.forEach((message) => {
          console.log(message)
          i = i+1
          console.log(i)
          if(idMessage == "ALL" && message.hasOwnProperty("MessageAttributes")){
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