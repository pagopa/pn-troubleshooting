const { AwsClientsWrapper } = require("pn-common");
const { parseArgs } = require('node:util');
const { open } = require('node:fs/promises');

// --- Variables ------------------------------------------

// Table, Partition Key and Sort Key used by the script
const table = {
  name: "pn-Timelines", // -> accountType = core
  pk: "iun",
  sk: "timelineElementId"  // correlationId
}

const accountType = "core"

// --- Arguments ------------------------------------------

const args = [
  { name: "region", mandatory: false },
  { name: "env", mandatory: false },
  { name: "sqsDumpFile", mandatory: true }
];

const parsedArgs = { values: { region, env, sqsDumpFile } } = parseArgs(
  {
    options: {
      // account_type: {type: "string",short: "a"},
      region: { type: "string", short: "r", default: "eu-south-1" },
      env: { type: "string", short: "e" },
      sqsDumpFile: { type: "string", short: "f" },
    }
  });

// --- Functions ------------------------------------------

function _checkingParameters(args, parsedArgs) {

  const usage = "Usage: node index.js [--region <region>]" +
    " --env <env> --days <number> --fileName <csv file> [--startActionId <actionId value>]\n";

  // Verifica dei valori degli argomenti passati allo script
  function isOkValue(argName, value, ok_values) {
    if (!ok_values.includes(value)) {
      console.log("Error: \"" + value + "\" value for \"--" + argName +
        "\" argument is not available, it must be in " + ok_values + "\n");
      process.exit(1);
    }
  };

  // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
  args.forEach(el => {
    if (el.mandatory && !parsedArgs.values[el.name]) {
      console.log("\nParam \"" + el.name + "\" is not defined or empty.")
      console.log(usage)
      process.exit(1)
    }
  });
};

function _sqsMsgParser(jsonLine) {

  function _fix_body_value(STRING) {
    return STRING.replaceAll('\\"', '"').
      replaceAll('"{', '{').
      replaceAll('}"', '}')
  }

  const msg = _fix_body_value(jsonLine)
  return JSON.parse(msg)
}

function _extract_iun_from_cx_id(CX_ID) {
  return CX_ID.match(/(?<=IUN_)[^\.]+/)[0]
}

function _elapsedHoursFromNow(refReqDate) {
  const rrd = new Date(refReqDate).getTime(); // ms
  return Math.round(((Date.now() - rrd) / 3600000) * 100) / 100
}

// --- Script ------------------------------------------

async function main() {

  _checkingParameters(args, parsedArgs);

  let dynamoClient;
  if (env) {
    dynamoClient = new AwsClientsWrapper(accountType, env);
  } else {
    dynamoClient = new AwsClientsWrapper();
  }
  dynamoClient._initDynamoDB()

  const sqsDumpFileHandler = await open(sqsDumpFile, 'r');

  for await (const sqsMsg of sqsDumpFileHandler.readLines()) {
    
    let parsedSqsMsg = _sqsMsgParser(sqsMsg);
    const {correlationId, referenceRequestDate} = parsedSqsMsg.Body
    const iun = _extract_iun_from_cx_id(correlationId)
    let result = await dynamoClient._queryRequest(table.name, table.pk, iun, table.sk, correlationId)

    if (result.Count !== '0') {
      let warnObj = {
        [table.pk]: iun,
        isNrResponsePresent: true,
        message: "Warning: National Registries response is present in timeline. This element will be skipped."
      }
      console.log(JSON.stringify(warnObj))
      continue
    }

    const hours = _elapsedHoursFromNow(referenceRequestDate)
    const days = Math.round(hours / 24)
    
    let infoObj = {
      [table.pk]: iun,
      [table.sk]: correlationId,
      approxElapsedHoursFromNow: hours,
      approxElapsedDaysFromNow: days,
      isNrResponsePresent: false,
      message: "National Registries response is not present in timeline"     
    }

    console.log(JSON.stringify(infoObj))

  };

  sqsDumpFileHandler?.close;

}

main()
