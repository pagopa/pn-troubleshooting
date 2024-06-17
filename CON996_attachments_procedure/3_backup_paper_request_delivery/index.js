const { AwsClientsWrapper } = require("./lib/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
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

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
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
  const awsClient = new AwsClientsWrapper( envName );
  
  console.log('Reading from file...')
  const fileContentLines = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  for( let i = 0; i < fileContentLines.length; i++ ){
    const requestData = JSON.parse(fileContentLines[i])
    const requestId = requestData.requestId
    const res = await awsClient._queryRequest("pn-PaperRequestDelivery", requestId)
    if(res.length > 0) {
      console.log("Element " + requestId + " found")
      appendJsonToFile("results/backup.json", JSON.stringify(unmarshall(res[0])))
    }
    else {
      appendJsonToFile("results/not-found.json", JSON.stringify({ "requestId": requestId }))
    }  
  }
}

main()