const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const MAX_ENDTIMESTAMP_DELAY = 20*60*1000

function elabResult(now, to_submit, event) {
  const isoTimestamp = new Date(now).toISOString()
  // Per la spiegazione di questo if fare riferimento a questo paragrafo
  //https://pagopa.atlassian.net/wiki/spaces/PN/pages/941228579/SRS+miglioramento+performance+delivery-push#US-06.9---Procedure-di-ripristino-in-caso-di-errori-definiti-in-US-06.
  if(to_submit) {
    appendJsonToFile(`results/${envName}_${isoTimestamp}`, "to_submit.json", JSON.stringify(unmarshall(event)))
  } else {
    appendJsonToFile(`results/${envName}_${isoTimestamp}`, "to_recheck.json", JSON.stringify(unmarshall(event)))
  }
}


function appendJsonToFile(filePath, fileName, data){
  if(!fs.existsSync(filePath))
    fs.mkdirSync(filePath, { recursive: true });
  fs.appendFileSync(path.join(filePath, fileName), data + "\n")
}

function prepareStringDataQuery(data){
  let stringDataQuery = 'filter @message like "Handle action"'
  if(Array.isArray(data)) {
    stringDataQuery = `${stringDataQuery} and ( @message like "${data.join('" or @message like "')}")`
  }
  else {
    const actionId = data       
    stringDataQuery = `${stringDataQuery} and @message like "${actionId}"`
  }
  return stringDataQuery;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <envName> [--visibilityTimeout <visibilityTimeout>] [--fileName <fileName> [--timestamp <timestamp>]] [--window] [kinesis [--dlq <dlq>]]"
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
    { name: "visibilityTimeout", mandatory: false, subcommand: [] },
    { name: "dlq", mandatory: false, subcommand: ['kinesis'] },
    { name: "fileName", mandatory: false, subcommand: [] },
    { name: "timestamp", mandatory: false, subcommand: ['fileName'] },
    { name: "window", mandatory: false, subcommand: [] },
    { name: "kinesis", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, dlq, visibilityTimeout, fileName, timestamp, window, kinesis },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      dlq: {
        type: "string", short: "d", default: undefined
      },
      visibilityTimeout: {
        type: "string", short: "v", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      timestamp: {
        type: "string", short: "t", default: undefined
      },
      window: {
        type: "string", short: "w", default: '10'
      },
      kinesis: {
        type: "boolean", short: "k", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  //Prepare AWS
  const nowTimestamp = Date.now();
  const account = 'core'
  const awsClient = new AwsClientsWrapper( account, envName );
  awsClient._initCloudwatch()
  awsClient._initDynamoDB()
  const windowSize = 1000*60*Number(window)
  if(!fileName) {
    awsClient._initSQS()
    let queueName;
    const maxNumberOfMessages = 1
    let i = 0;
    let hasNext = true;
    if(kinesis) {
      if(!dlq && dlq !== 'pn-delivery_push_action_router_DLQ' && dlq !== 'pn-delivery_push_action_enqueuer_DLQ') {
        console.log(`Verify dlq param... script available only for 'pn-delivery_push_action_router_DLQ' or 'pn-delivery_push_action_enqueuer_DLQ'`)
        process.exit(1)
      }
      queueName = dlq
      awsClient._initKinesis()
    }
    else {
      queueName = 'pn-delivery_push_action-timeout-error-DLQ'
    }
    const queueUrl = await awsClient._getQueueUrl(queueName);
    while (hasNext) {
      const response = await awsClient._receiveMessages(queueUrl, maxNumberOfMessages, visibilityTimeout);
      const messages = response.Messages;
      if (messages && messages.length > 0) {
        i = messages.length + i
        console.log(`Hai ricevuto ${i} messaggi dalla coda.`);
        for(let z = 0; z < messages.length; z++) {
          const event = messages[z]
          let startTimestamp;
          let actionId;
          if(kinesis) {
            const kinesisBody = JSON.parse(event.Body)
            const shardId = kinesisBody.KinesisBatchInfo.shardId
            const result = await awsClient._getSingleShardInfo('pn-action-cdc', shardId)
            const data = Buffer.from(result.Records[0].Data).toString("utf-8")
            actionId = JSON.parse(data).dynamodb.Keys.actionId.S
            startTimestamp = JSON.parse(data).dynamodb.ApproximateCreationDateTime
          }
          else {
            actionId = JSON.parse(event.Body).actionId  
            startTimestamp = Number(event.Attributes.SentTimestamp)
          }
          const initialTimeStamp = startTimestamp;
          const maxTimestamp = Math.min(nowTimestamp, startTimestamp + MAX_ENDTIMESTAMP_DELAY);
          let endTimestamp = startTimestamp + windowSize
          let logs;
          for(; startTimestamp < maxTimestamp; startTimestamp = endTimestamp, endTimestamp += windowSize) {
            endTimestamp = Math.min(endTimestamp, maxTimestamp);
            const queryString = prepareStringDataQuery(actionId)
            logs = await awsClient._executeCloudwatchQuery(['/aws/ecs/pn-delivery-push'], startTimestamp, endTimestamp, queryString, 1)
            if(logs.length > 0) {
              console.log(`logs found for actionId ${actionId}`)
              const tmp = {
                MD5OfBody: event.MD5OfBody, 
                MD5OfMessageAttributes: event.MD5OfMessageAttributes, 
                Body: event.Body
              }
              console.log(event)
              console.log(`To remove message with key ${actionId} from DLQ`)
              appendJsonToFile(`results/${new Date(nowTimestamp).toISOString()}`, "to_remove.json", JSON.stringify(tmp))
              break;
            }
          }
          if(logs.length == 0) {
            console.log(`ActionId ${actionId} unhandled`)
            const res = await awsClient._queryRequest('pn-Action', 'actionId', actionId)
            if(res.Items.length > 0) {
                res.Items.forEach(action => {
                  const to_submit = (nowTimestamp - initialTimeStamp / 36e5) > 12
                  elabResult(nowTimestamp, to_submit, action)
              });
            }
          }
        }
      } else {
        hasNext = false;
        console.log('La coda è vuota.');
      }
    }
  } else {
    const actionIds = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
    let actionMap = {};
    actionIds.forEach(actionId => {
      actionMap[actionId] = false
    })
    let startTimestamp = Number(timestamp)
    let endTimestamp = startTimestamp + windowSize
    const initialTimeStamp = startTimestamp;
    const maxTimestamp = Math.min(nowTimestamp, startTimestamp + MAX_ENDTIMESTAMP_DELAY);
    let logs;
    for(; startTimestamp < maxTimestamp && Object.keys(actionMap).length > 0; startTimestamp = endTimestamp, endTimestamp += windowSize) {
      endTimestamp = Math.min(endTimestamp, maxTimestamp);
      const queryString = prepareStringDataQuery(actionIds)
      logs = await awsClient._executeCloudwatchQuery(['/aws/ecs/pn-delivery-push'], startTimestamp, endTimestamp, queryString, 1)
      console.log(logs)
      Object.keys(actionMap).forEach(id => {
        if(!actionMap[id]) {
          logs.forEach(log => {
            if(log['@message'].contains(id)) {
              actionMap[id] = true;
            }
          });
        } else {
          delete actionMap[id]
        }
      })
    }
    const actionArr = Object.keys(actionMap)
    if(actionArr.length > 0) {
      for(let q = 0; q < actionArr.length; q++) {
        console.log( actionArr[q])
        const res = await awsClient._queryRequest('pn-Action', 'actionId', actionArr[q])
        if(res.Items.length > 0) {
          res.Items.forEach(action => {
            const to_submit = (nowTimestamp - initialTimeStamp / 36e5) > 12
            elabResult(nowTimestamp, to_submit, action)
          });
        }
      }
    }
    else {
      console.log("No actionId to perform")
    }
  }
}

main();