const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { _parseCSV, sleep } = require('pn-common/libs/utils');

function appendJsonToFile(fileName, data){
  if(!fs.existsSync(`results`))
    fs.mkdirSync(`results`, { recursive: true });
  fs.appendFileSync(`results/${fileName}`, data + "\n")
}

function diffDayFromToday(datems) {
  return Math.ceil(Math.abs(new Date().getTime() - datems) / (1000 * 60 * 60 * 24)) - 1 //removing today
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--expires <expires>]"
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
    { name: "fileName", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, expires },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  const datas = await _parseCSV(fileName, ',')
  for(const e of datas){
    const requestId = e['REQUEST_ID']
    const cxId = e['CX_ID']
    const data = {
      cxId: cxId,
      requestId: requestId
    } 
    let imports = []
    const keySchema = [{
      KeyType: "S",
      AttributeName: "cxId"
    }, {
      KeyType: "D",
      AttributeName: "requestId"
    }
    ]
    let keys = {}
    for(const key of keySchema) {
      keys[key.AttributeName] = {
          codeAttr: `#${key.KeyType}`,
          codeValue: `:${key.KeyType}`,
          value: data[key.AttributeName],
          operator: "="
      }
    }
    let resultsOf = {
      cxId: cxId,
      ACCEPTED: 0,
      REJECTED: 0,
      DELETED: 0
    }
    let statusRequest = true
    while(statusRequest) {
      let result = await awsClient._queryRequest("pn-RaddRegistryImport", "cxId", cxId)
      let res;
      if(result.Items.length > 0) {
        res = result.Items.find(element => element.requestId.S === requestId
        );
      }
      if(res.status.S === 'DONE') {
        statusRequest = false 
      }
      else {
        await sleep(3000)
      }
    }
    let lastEvaluatedKey;
    let first = true
    while(first || lastEvaluatedKey) {
      first = false;
      let result = await awsClient._dynamicQueryRequestByIndex("pn-RaddRegistryRequest", "cxId-requestId-index", keys, 'AND', lastEvaluatedKey) 
      lastEvaluatedKey = result.LastEvaluatedKey
      if(result.Items.length > 0) {
        imports = imports.concat(result.Items)
        /*result.Items.forEach(element => { TO REMOVE
          if(element.requestId.S === requestId){
            imports.push(unmarshall(element))
          }
        });*/
      }
    }
    for(let i = 0; i < imports.length; i++){
      let element = unmarshall(imports[i])
      switch (element.status) {
        case 'ACCEPTED':
          resultsOf.ACCEPTED++
          break;
        case 'REJECTED':
          resultsOf.REJECTED++
          appendJsonToFile(`REJECTED.json`, JSON.stringify(element))
          break;
        case 'DELETED':
          resultsOf.DELETED++
          break;
        default:
          break;
      }
    }
    first = true
    lastEvaluatedKey
    let result;
    while(first || lastEvaluatedKey) {
      first = false
      result = await awsClient._dynamicQueryRequestByIndex("pn-RaddRegistry", "cxId-requestId-index", keys, 'AND', lastEvaluatedKey)
      lastEvaluatedKey = result.LastEvaluatedKey
    }
    //let res; TO REMOVE
    console.log(result.Items.length)
    if((parseInt(resultsOf.ACCEPTED) + parseInt(resultsOf.DELETED)) == result.Items.length) {
      //res = result.Items.find(element => element.requestId.S === requestId); TO REMOVE 
      console.log(`OK - ${JSON.stringify(resultsOf)}`)
    }
    else {
      console.log(`KO - ${JSON.stringify(resultsOf)}`)

    }
  }
}

main();