const { AwsClientsWrapper } = require("./lib/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require("@aws-sdk/util-dynamodb")


function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync(fileName, data + "\n")
}

function _checkStatusRequest(statusRequest) {
  console.log("status request is " + statusRequest)
  let statusRequests = ["RECRS006", "RECRN006", "RECAG004", "RECRI005", "RECRSI005", "RECRS013", "RECRN013", "RECAG013"]
  if (statusRequests.indexOf(statusRequest) >= 0) {
    return true;
  }
  return false;
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
  ]
  const values = {
    values: { envName, fileName, stolen },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "p", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  
  console.log('Reading from file...')
  const requestIdx = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  for( let i = 0; i < requestIdx.length; i++ ){
    let pc_retry_index = parseInt(requestIdx[i].split("PCRETRY_")[1])
    let requestId = requestIdx[i].substring(0, requestIdx[i].length - 1)
    let res = await awsClient._queryRequest("pn-EcRichiesteMetadati", "pn-cons-000~" + requestId + pc_retry_index)  
    if (res.length>0) {
      appendJsonToFile("results/ErrorRequestIdx.txt", "ERROR " + requestId + pc_retry_index + " exists")
      continue
    }
    res = await awsClient._queryRequest("pn-EcRichiesteMetadati", "pn-cons-000~" + requestId + (pc_retry_index - 1))  
    if (res.length>0) {
      const metadati = unmarshall(res[0])
      if(_checkStatusRequest(metadati.statusRequest)) {
        console.log(requestId + (pc_retry_index - 1));
        appendJsonToFile("results/requestIdx.txt", requestId + (pc_retry_index - 1))
      }
    }
    else {
      appendJsonToFile("results/ErrorRequestIdx.txt", "ERROR " + requestId + (pc_retry_index - 1)  + " does not exists")
    }
  }
}

main()