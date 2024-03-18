const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');

function _checkSlaViolationInput(sla) {
  console.log(sla)
  let slaAllowed = ["SEND_PAPER_AR_890", "REFINEMENT", "VALIDATION", "SEND_PEC", "SEND_AMR"]
  if (slaAllowed.indexOf(sla.toUpperCase()) >= 0) {
    return false;
  }
  return true;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --awsProfile <aws-profile> --slaViolation <sla-violation>"
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
  if(_checkSlaViolationInput(values.values['slaViolation'])) {
    console.log("Sla violation param '" + values.values['slaViolation'] + "' not allowed. Insert one of following: SEND_PAPER_AR_890, REFINEMENT, VALIDATION, SEND_PEC, SEND_AMR")
    process.exit(1)
  }
}

async function _writeInFile(result, filename ) {
  fs.mkdirSync("result", { recursive: true });
  const str = result.map(el => {
    return JSON.stringify(el, null)
  }).join('\n')
  fs.writeFileSync(filename+'.json', str, 'utf-8')
}

async function main() {

  const args = [
    { name: "awsProfile", mandatory: true, subcommand: [] },
    { name: "slaViolation", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { awsProfile, slaViolation },
  } = parseArgs({
    options: {
      awsProfile: {
        type: "string", short: "p", default: undefined
      },
      slaViolation: {
        type: "string", short: "t", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  slaViolation = slaViolation.toUpperCase()
  const awsClient = new AwsClientsWrapper( awsProfile );
  let first = true;
  var results = []
  var lastEvaluatedKey = null
  
  while(first || lastEvaluatedKey != null) {
    var res = await awsClient._queryRequest("pn-ProgressionSensorData", slaViolation, lastEvaluatedKey);
    if(res.LastEvaluatedKey) {
      lastEvaluatedKey = res.LastEvaluatedKey
    } 
    else {
      lastEvaluatedKey = null;
      first = false;
    }
    results = results.concat(res.Items);
    console.log(results)
  }
  let resultPath = path.join(__dirname, "/results/")
  fs.mkdirSync(path.join(__dirname, "/results/"), { recursive: true })
  await _writeInFile(results, resultPath + results.length+"_"+slaViolation+"_"+new Date().toISOString())
  console.log('Sono stati memorizzati n° ' + results.length + ' elementi.');

}

main();