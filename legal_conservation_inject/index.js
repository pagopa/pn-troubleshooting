const { parseArgs } = require('util');ì
const { AwsClientsWrapper } = require("pn-common");
const { _parseCSV, sleep } = require('pn-common/libs/utils');

function prepareBody(data) {
  const body = {
    "kinesisSeqNumber": "49642115848638112355480323782160580827394338152236711954",
    "version": "0",
    "isFake": true,
    "id": "340f3708-f0cb-405a-13bf-96d2849994bf",
    "detail-type": "SafeStorageOutcomeEvent",
    "source": "GESTORE DISPONIBILITA",
    "account": "350578575906",
    "time": new Date().toISOString(),
    "region": "eu-south-1",
    "resources": [],
    "detail": data
  }
  return body;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--dryrun]"
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
    { name: "dryrun", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      dryrun: {
        type: "boolean", short: "s", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  const data = await _parseCSV(fileName, ",")
  const awsClient = new AwsClientsWrapper( 'confinfo', envName );
  awsClient._initLambda()
  const lambdaName = "pn-legalConservationStarter"
  for(const d of data) {
    const body = prepareBody(d)
    console.log("Handling event", JSON.stringify(body))
    if(!dryrun) {
      await awsClient._invokeCommand(lambdaName, "Event", JSON.stringify(body))
    }
    await sleep(1000)
  }
  
}

main();