const { parseArgs } = require('util');
const { AwsClientsWrapper } = require("pn-common");
const { _parseCSV, sleep } = require('pn-common/libs/utils');
const crypto = require('crypto');

function prepareBody(accountId, data) {
  const body = {
    "kinesisSeqNumber": "49642115848638112355480323782160580827394338152236711954",
    "version": "0",
    "isFake": true,
    "id": crypto.randomUUID(),
    "detail-type": "SafeStorageOutcomeEvent",
    "source": "GESTORE DISPONIBILITA",
    "account": accountId,
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
  awsClient._initSTS()
  const lambdaName = "pn-legalConservationStarter"
  const accId = (await awsClient._getCallerIdentity()).Account
  for(const d of data) {
    const body = prepareBody(accId, d)
    console.log("Handling event", JSON.stringify(body))
    if(!dryrun) {
      await awsClient._invokeCommand(lambdaName, "RequestResponse", JSON.stringify(body))
    }
    else {
      console.log(body)
    }
    await sleep(1000)
  }
  
}

main();