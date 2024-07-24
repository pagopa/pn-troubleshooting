const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { ApiClient } = require("./libs/api");
require('dotenv').config()

function elabResult(now, to_submit, event) {
  const isoTimestamp = timestampToLog(now)
  // Per la spiegazione di questo if fare riferimento a questo paragrafo
  //https://pagopa.atlassian.net/wiki/spaces/PN/pages/941228579/SRS+miglioramento+performance+delivery-push#US-06.9---Procedure-di-ripristino-in-caso-di-errori-definiti-in-US-06.
  if(to_submit) {
    appendJsonToFile(`results/${envName}_${isoTimestamp}`, "to_submit.json", JSON.stringify(unmarshall(event)))
  } else {
    appendJsonToFile(`results/${envName}_${isoTimestamp}`, "to_recheck.json", JSON.stringify(unmarshall(event)))
  }
}

function error(now, actionId) {
  const isoTimestamp = timestampToLog(now)
  appendJsonToFile(`results/${envName}_${isoTimestamp}`, "not_found.json", actionId)
}

function timestampToLog(timestamp){
  return new Date(timestamp + 2*60*60*1000).toISOString()
}

function writeFile(response, nowTs, initialTs, action) {
    if(response.Items.length > 0) {
      console.log(`ActionId "${action}" to perform`)
      response.Items.forEach(el => {
        const to_submit = ((nowTs - initialTs) / 36e5) > 12
        elabResult(nowTs, to_submit, el)
    });
  }
  else {
    console.log(`${action} not found in pn-Action`)
    error(nowTs, action)
  }
}

function appendJsonToFile(filePath, fileName, data){
  if(!fs.existsSync(filePath))
    fs.mkdirSync(filePath, { recursive: true });
  fs.appendFileSync(path.join(filePath, fileName), data + "\n")
}

function prepareDataQuery(data, startDate, endDate) {
  const message = `Handle .*`
  let dataQuery = {
    "query": {
      "bool": {
        "must": [
          {
            "range": {
              "@timestamp": {
                "gte": startDate,
                "lte": endDate
              }
            }
          }
        ]
      }
    }
  }
  if(Array.isArray(data)) {
    dataQuery.query.bool["should"] = []
    dataQuery.query.bool["minimum_should_match"] = 1
    data.forEach(actionId => {
      dataQuery.query.bool.should.push(
        {
          "regexp": {
            "message": `${message} ${actionId} .*`
          }
        }
      )
    });
  }
  else {
    const actionId = data   
    dataQuery.query.bool.must.push({
      "regexp": {
        "message": `${message} ${actionId} .*`
      }
    }) 
    dataQuery.size = 1
  }
  return dataQuery;
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
        type: "string", short: "w", default: '120'
      },
      kinesis: {
        type: "boolean", short: "k", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  //Prepare AWS
  const nowTimestamp = Date.now()
  const account = 'core'
  const awsClient = new AwsClientsWrapper( account, envName );
  awsClient._initCloudwatch()
  awsClient._initDynamoDB()
  const endTimestamp = Date.now() + (2*60*60*1000)
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
        console.log(`Message n° ${i} to elaborate...`);
        for(let z = 0; z < messages.length; z++) {
          const event = messages[z]
          let startTimestamp;
          let actionId;
          if(kinesis) {
            const kinesisBody = JSON.parse(event.Body)
            const shardId = kinesisBody.KinesisBatchInfo.shardId
            const sequenceNumber = kinesisBody.KinesisBatchInfo.startSequenceNumber
            const result = await awsClient._getSingleShardInfo('pn-action-cdc', shardId, sequenceNumber)
            const data = Buffer.from(result.Records[0].Data).toString("utf-8")
            actionId = JSON.parse(data).dynamodb.Keys.actionId.S
            startTimestamp = JSON.parse(data).dynamodb.ApproximateCreationDateTime
          }
          else {
            actionId = JSON.parse(event.Body).actionId  
            startTimestamp = Number(event.Attributes.SentTimestamp)
          }
          const dataQuery = prepareDataQuery(actionId, new Date(startTimestamp).toISOString(), new Date(endTimestamp).toISOString())
          const result = await ApiClient.requestToOpensearch(dataQuery)
          if(result.hits.hits.length > 0) {
            console.log(`logs found for actionId ${actionId}`)
            const tmp = {
              MD5OfBody: event.MD5OfBody, 
              MD5OfMessageAttributes: event.MD5OfMessageAttributes, 
              Body: event.Body
            }
            console.log(`To remove message with key ${actionId} from DLQ`)
            appendJsonToFile(`results/${envName}_${timestampToLog(nowTimestamp)}`, "to_remove.json", JSON.stringify(tmp))
          }
          else {
            console.log(`ActionId ${actionId} unhandled`)
            const res = await awsClient._queryRequest('pn-Action', 'actionId', actionId)
            writeFile(res, nowTimestamp, startTimestamp, actionId)
          }
        }
      } else {
        hasNext = false;
        console.log('Execution complete.');
      }
    }
  } else {
    const actionIds = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
    let startTimestamp = Number(timestamp)
    const dataQuery = prepareDataQuery(actionIds, new Date(startTimestamp).toISOString(), new Date(endTimestamp).toISOString())
    const result = await ApiClient.requestToOpensearch(dataQuery)
    if(result.hits.hits.length > 0) {
      result.hits.hits.forEach(hit => {
        actionIds.forEach(actionId => {
          if(hit._source.message.includes(actionId)) {
            const index = actionIds.indexOf(actionId);
            if (index > -1) { // only splice array when item is found
              actionIds.splice(index, 1); // 2nd parameter means remove one item only
            }
            console.log(`logs found for actionId ${actionId}`)
          }
        });
      });
      if(actionIds.length > 0) {
        for(let q = 0; q < actionIds.length; q++) {
          console.log(`ActionId ${actionId} unhandled`)
          const res = await awsClient._queryRequest('pn-Action', 'actionId', actionIds[q])
          writeFile(res, nowTimestamp, startTimestamp, actionIds[q])
        }
      }
      else {
        console.log("No actionId to perform")
      }
    }
    console.log('Execution complete.');
  }
}

main(); 