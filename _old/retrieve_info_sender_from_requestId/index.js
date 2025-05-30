const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { unmarshall } = require("@aws-sdk/util-dynamodb")

function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync(fileName, data + "\n")
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

async function _writeInFile(result, filename ) {
  const str = result.map(el => {
    return JSON.stringify(el, null)
  }).join('\n')
  fs.writeFileSync(filename+'.json', str, 'utf-8')
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, outputFolder },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  let results = {}
  for(let i = 0; i < fileRows.length; i++){
    const requestId = fileRows[i]
    const iun = requestId
    console.log('Handling requestId: ' + requestId)
    console.log(iun)
    let result = await awsClient._queryRequest("pn-Timelines", "iun", iun)
    let latestTimelineEvent = unmarshall(result.Items[0]);
    !results[latestTimelineEvent.paId] ? results[latestTimelineEvent.paId] = {pa: '', requestIdx: []}  : null
    results[latestTimelineEvent.paId].requestIdx.push({
      requestId: requestId,
      notificationSentAt: latestTimelineEvent.notificationSentAt
    })
    console.log(latestTimelineEvent.paId)
  }
  const paIdx = Object.keys(results);
  for(let i = 0; i < paIdx.length; i++){
    let result = await awsClient._queryRequest("pn-OnboardInstitutions", "id", paIdx[i])
    results[paIdx[i]].pa = result.Items[0].description.S
  };
  appendJsonToFile("results/info.json", JSON.stringify(results, null, 2))
  console.log("End Execution")
}

main();