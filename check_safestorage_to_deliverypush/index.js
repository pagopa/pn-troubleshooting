const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function elabResult(now, to_submit, event) {
  const isoTimestamp = timestampToLog(now)
  // Per la spiegazione di questo if fare riferimento a questo paragrafo
  //https://pagopa.atlassian.net/wiki/spaces/PN/pages/941228579/SRS+miglioramento+performance+delivery-push#US-06.9---Procedure-di-ripristino-in-caso-di-errori-definiti-in-US-06.
  if(to_submit) {
    appendJsonToFile(`results/${envName}_${isoTimestamp}`, "timeline.json", JSON.stringify(unmarshall(event)))
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

function prepareStringDataQuery(data){
  let stringDataQuery = 'filter @message like "IUN_" and @message like "AUD_"'
  stringDataQuery = `${stringDataQuery} and @message like "${data}"`
  return stringDataQuery;
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
  const usage = "Usage: node index.js --envName <envName> --fileName <fileName>"
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
    { name: "fileName", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  //Prepare AWS
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initCloudwatch()
  awsClient._initDynamoDB()
  for(let i = 0; i < fileRows.length; i++) {
    const data = JSON.parse(fileRows[i])
    const body = JSON.parse(data.Body)
    const initialTimeStamp = Number(data.Attributes.SentTimestamp) - (20*60*1000)
    const endTimestamp = Number(data.Attributes.SentTimestamp) + (40*60*1000)
    const queryString = prepareStringDataQuery(body.key)
    logs = await awsClient._executeCloudwatchQuery(['/aws/ecs/pn-delivery-push'], initialTimeStamp, endTimestamp, queryString, 1)
    if(logs.length > 0) {
      let d;
      logs.forEach(l => {
        l.forEach(e => {
          if(e.field == '@message') {
            d = {
              iun: (JSON.parse(e.value)).message.split("IUN=")[1].split(" ")[0],
              fileKey: body.key,
              timelineId: (JSON.parse(e.value)).message.split("TIMELINEID=")[1].split(" ")[0],
            }
          }
        });
      });
      const res = await awsClient._queryRequest('pn-Timelines', 'iun', d.iun)
      if(res.Items.length > 0) {
        let element = [];
        res.Items.forEach(e => {
          let tmp = unmarshall(e)
          element.push({
            timelineElementId: tmp.timelineElementId,
            category: tmp.category
          })
        });
        d.timelines = element
        appendJsonToFile('result', 'output.json', JSON.stringify(d))
      }
    }
    else {
      console.log(`${body.key} not found!`)
    }
  }
  process.exit(1)
}

main(); 