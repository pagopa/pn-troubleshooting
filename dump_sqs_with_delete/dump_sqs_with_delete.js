const { AwsClientsWrapper } = require("./lib/AwsClientWrapper");
const fs = require('fs');
const { parseArgs } = require('util');
const path = require('path');

async function appendMessagesToFile(messages, filePath) {
  try {
    for (const msg of messages) {
      const line = JSON.stringify(msg);
      // fs.appendFileSync(filePath, line + '\n');
      fs.appendFile(filePath, line + '\n', (err) => {
        if (err) {
          console.error('Errore durante la scrittura dei messaggi nel file:', err);
          throw err;
        }
      });
    }
  } catch (error) {
    console.error('Errore durante la scrittura dei messaggi nel file:', error);
    throw error;
  }
}


async function dumpSQSWithDelete() {
  const args = [
    { name: "awsProfile", mandatory: true, subcommand: [] },
    { name: "region", mandatory: false, subcommand: [] },
    { name: "queueName", mandatory: true, subcommand: [] },
    { name: "visibilityTimeout", mandatory: false, subcommand: [] },
    { name: "format", mandatory: false, subcommand: [] },
    { name: "limit", mandatory: false, subcommand: [] },
    { name: "deleteMode", mandatory: false, subcommand: [] }
  ]
  
  const values = {
    values: { awsProfile, region, queueName, format, visibilityTimeout, limit, deleteMode },
  } = parseArgs({
    options: {
      awsProfile: {
        type: "string",
        short: "a"
      },
      region: {
        type: "string", short: "r", default: undefined
      },
      queueName: {
        type: "string",
        short: "q"
      },
      visibilityTimeout: {
        type: "string",
        short: "t",
        default: "60"
      },
      format: {
        type: "string",
        short: "f",
        default: "raw"
      },
      limit: {
        type: "string",
        short: "l",
        default: "undefined"
      },
      deleteMode: {
        type: "string",
        short: "d",
        default: "batch"
      },
    },
  });
  
  function _checkingParameters(args, values){
    const usage = "Usage: node dump_sqs.js --awsProfile <aws-profile> [--region <region>] --queueName <queue-name> --visibilityTimeout <visibility-timeout> [--limit <limit-value> [--deleteMode <delete-mode>]"
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
  
  const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  fs.mkdirSync(path.join(__dirname, 'result'), { recursive: true });
  const resultPath = path.join(__dirname, 'result/dump' +'_'+queueName+'_'+dateIsoString+'.txt');

  const awsClient = new AwsClientsWrapper( awsProfile, region );
  const queueUrl = await awsClient._getQueueUrl(queueName);
  let maxNumberOfMessages = 10;
  const startTime = Date.now();
  let i = 0;
  try {
    let hasNext = true;
    while (hasNext) {
      const response = await awsClient._receiveMessages(queueUrl, maxNumberOfMessages, visibilityTimeout);
      const messages = response.Messages;
      if (messages && messages.length > 0) {
        i = messages.length + i
        console.log(`Hai ricevuto ${i} messaggi dalla coda.`);
        await appendMessagesToFile(messages, resultPath)
        await awsClient._deleteMessages(queueUrl, messages, deleteMode);
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
    const endTime = Date.now();
    const timeTaken = endTime - startTime;
    console.log(`DUMP NUMBER OF MESSAGES ${i} IN ${timeTaken} ms`);
  }
}

dumpSQSWithDelete()