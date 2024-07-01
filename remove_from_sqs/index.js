const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync(fileName, data + "\n")
}

function prepareData(data){
  let result = {}
  const dataSample = JSON.parse(data[0])
  console.log(dataSample)
  if(dataSample.MD5OfMessageAttributes) {
    result['hasMessageAttributes'] = false
    data.forEach(line => {
      const tmp = JSON.parse(line)
      if(result[tmp.MD5OfBody]){
        result[`${tmp.MD5OfBody}#${tmp.MD5OfMessageAttributes}`] = result[`${tmp.MD5OfBody}#${tmp.MD5OfMessageAttributes}`] + 1
      }
      else {
        result[`${tmp.MD5OfBody}#${tmp.MD5OfMessageAttributes}`] = 1
      }
    });
  }
  else {
    result['hasMessageAttributes'] = true
    data.forEach(line => {
      const tmp = JSON.parse(line)
      if(result[tmp.MD5OfBody]){
        result[tmp.MD5OfBody] = result[tmp.MD5OfBody] + 1
      }
      else {
        result[tmp.MD5OfBody] = 1
      }
    });
  }
  return result;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --account <account> --envName <envName> --queueName <queueName> --visibilityTimeout <visibilityTimeout> --fileName <fileName> "
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
    { name: "account", mandatory: true, subcommand: [] },
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "queueName", mandatory: true, subcommand: [] },
    { name: "visibilityTimeout", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { account, envName, queueName, visibilityTimeout, fileName },
  } = parseArgs({
    options: {
      account: {
        type: "string", short: "a", default: undefined
      },
      envName: {
        type: "string", short: "e", default: undefined
      },
      queueName: {
        type: "string", short: "e", default: undefined
      },
      visibilityTimeout: {
        type: "string", short: "f", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  //Prepare AWS
  const awsClient = new AwsClientsWrapper( account, envName );
  awsClient._initSQS()
  const queueUrl = await awsClient._getQueueUrl(queueName);
  const maxNumberOfMessages = 10
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(line=>line.trim()!='')
  const data = prepareData(fileRows)
  let i = 0;
  let hasNext = true;
  while (hasNext) {
    const response = await awsClient._receiveMessages(queueUrl, maxNumberOfMessages, visibilityTimeout);
    const messages = response.Messages;
    if (messages && messages.length > 0) {
      i = messages.length + i
      console.log(`Hai ricevuto ${i} messaggi dalla coda.`);
      messages.forEach((message) => {
        let key;
        if(message.MD5OfMessageAttributes) {
          key = `${message.MD5OfBody}#${message.MD5OfMessageAttributes}`
        }
        else {
          key = `${message.MD5OfBody}`
        }
        if(data[key]) {
          //const res = await awsClient._deleteMessageFromQueue(queueUrl, message.ReceiptHandle)
          data[key] = data[key] - 1
        }
      });
    } else {
      hasNext = false;
      console.log('La coda è vuota.');
    }
  }
  Object.keys(data).forEach(k => {
    if(data[k]==0){
      delete data[k]
    }
  });
  appendJsonToFile(`${fileName}_result.json`, data)
}

main();