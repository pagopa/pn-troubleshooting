const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");

function createTimestampFile(fileName, timestamp){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  if((fs.existsSync(`results/${fileName}`)))
    fs.rmSync(`results/${fileName}`)
  fs.appendFileSync("results/" + fileName, timestamp)
}

function dateAtMinute(date){
  return date.substring(0, date.lastIndexOf(':'))
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --days <days> [--dryrun]"
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
    { name: "envName", mandatory: false, subcommand: [] },
    { name: "fileName", mandatory: false, subcommand: [] },

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
      }
    },
  });  
  _checkingParameters(args, values)
  let awsClient;
  if(envName) {
    awsClient = new AwsClientsWrapper('core', envName);
  }
  else {
    awsClient = new AwsClientsWrapper();
  }
  awsClient._initDynamoDB()
  awsClient._initCloudwatch()
  let timestamp = new Date();
  timestamp.setMinutes(timestamp.getMinutes() - 6); 
  startLastTimeValidated = dateAtMinute(timestamp.toISOString());
  if(fileName) {
    startLastTimeValidated = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' })
    timestamp = new Date(startLastTimeValidated);
  }
  for(let x = 0; x < 5; x++) {
    timestamp.setMinutes(timestamp.getMinutes() + 1);
    lastTimeValidated = dateAtMinute(timestamp.toISOString());
    let validationSla = []
    for(let i = 1; i <= 10; i++) {
      let first = true
      let lastEvaluatedKey;
      while(first || lastEvaluatedKey) {
        console.log(`QUERY ON ${i.toString().padStart(2, '0')}#${lastTimeValidated}`)
        let result = await awsClient._queryRequestByIndex("pn-ProgressionSensorData", "alarmTTL-index", "alarmTTLYearToMinute", `${i.toString().padStart(2, '0')}#${lastTimeValidated}`, lastEvaluatedKey)
        if(result.LastEvaluatedKey) {
          lastEvaluatedKey = res.LastEvaluatedKey
        } 
        else {
          lastEvaluatedKey = null;
          first = false;
        }
        if(result.Items.length>0) {
          let validations = result.Items.filter(item => {
            return item.type.S === 'VALIDATION'
          })
          validationSla.concat(validations)
        }
        lastEvaluatedKey = result.LastEvaluatedKey
      }
    }
    await awsClient._putSingleMetricData("OER/Violation", "validation", "Count", validationSla.length)
    console.log(`SAVING ${dateAtMinute(timestamp.toISOString())}`)
    createTimestampFile(`latestTimestamp.txt`, dateAtMinute(timestamp.toISOString()))
  }
}

main();