const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { _parseCSV } = require("pn-common/libs/utils");
const { AwsClientsWrapper } = require("pn-common");

function appendJsonToFile(fileName, data){
  if(!fs.existsSync(`results`))
    fs.mkdirSync(`results`, { recursive: true });
  fs.appendFileSync(`results/${fileName}`, data + "\n")
}

function removePrefix(str) {
  return str.split("safestorage://")[1]
}

function _checkData(data){
  const problem = []
  if(data.ack_gen != data.ack_res) {
    problem.push(data.ack_gen > data.ack_res ? "Missing ack response" : "Missing ack generation")
  }
  if(data.work_gen != (Number(data.work_fail_res) +  Number(data.work_succ_res))) {
    problem.push(data.work_gen > (Number(data.work_fail_res) + Number(data.work_succ_res)) ? "Missing work response" : "Missing work generation")
  }
  if(data.unr_gen != data.unr_resp) {
    problem.push(data.unr_gen > data.unr_resp ? "Missing unr response" : "Missing unr generation")
  }
  if(data.not_view_gen != data.not_view_resp) {
    problem.push(data.not_view_gen > data.not_view_resp ? "Missing noti_view response" : "Missing noti_view generation")
  }
  if(data.aar_gen != data.aar_resp) {
    problem.push(data.aar_gen > data.aar_resp ? "Missing aar response" : "Missing aar generation")
  }
  return problem;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name>"
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
    { name: "validation", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, validation },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },      
      fileName: {
        type: "string", short: "f", default: undefined
      },
      validation: {
        type: "boolean", short: "v", default: false
      }
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  const data = validation ? fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n') : await _parseCSV(fileName, ',')
  const dataMap = new Map()
  const result = []
  data.forEach(e => {
    dataMap.set(e.iun, _checkData(e))
  });
  if(validation) {
    for(let i = 0; i < data.length; i++){
      const iun = data[i]
      const timelines = (await awsClient._queryRequest("pn-Timelines", "iun", iun)).Items
      let tmp = timelines.filter(x => {
        return x.category.S === 'SENDER_ACK_CREATION_REQUEST'
      })
      result.push({
        iun: iun,
        legalFact: removePrefix(unmarshall(tmp[0]).details.legalFactId)
      })
    }
  } 
  else {
    for (let key of dataMap.keys()) {
      const problems = dataMap.get(key)
      for (let problem of problems) {
        const timelines = (await awsClient._queryRequest("pn-Timelines", "iun", key)).Items
        if(problem.includes('aar')){
          let tmp = timelines.filter(x => {
            return x.category.S === 'AAR_CREATION_REQUEST'
          })
          result.push({
            iun: key,
            legalFact: removePrefix(unmarshall(tmp[0]).details.aarKey)
          })
        }
        else if(problem.includes('ack')){
          console.log('contains ACK')
          let tmp = timelines.filter(x => {
            return x.category.S === 'SENDER_ACK_CREATION_REQUEST'
          })
          result.push({
            iun: key,
            legalFact: removePrefix(unmarshall(tmp[0]).details.legalFactId)
          })
        }
        else if(problem.includes('unr')){
          console.log('contains UNREACHABLE')
          let tmp = timelines.filter(x => {
            return x.category.S === 'COMPLETELY_UNREACHABLE_CREATION_REQUEST'
          })
          result.push({
            iun: key,
            legalFact: removePrefix(unmarshall(tmp[0]).details.legalFactId)
          })
        }
        else if(problem.includes('noti_view')){
          console.log('contains NOTIFICATION_VIEWED')
          let tmp = timelines.filter(x => {
            return x.category.S === 'NOTIFICATION_VIEWED_CREATION_REQUEST'
          })
          result.push({
            iun: key,
            legalFact: removePrefix(unmarshall(tmp[0]).details.legalFactId)
          })
        }
        else if(problem.includes('work')){
          console.log('contains WORKFLOW')
          let tmp = timelines.filter(x => {
            return x.category.S === 'DIGITAL_DELIVERY_CREATION_REQUEST'
          })
          result.push({
            iun: key,
            legalFact: removePrefix(unmarshall(tmp[0]).details.legalFactId)
          })
        }
      }
    }
  }
  appendJsonToFile("result.json", JSON.stringify(result))
}

main();