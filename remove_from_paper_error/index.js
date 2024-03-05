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
    const requestId = requestIdx[i]
    const res = await awsClient._queryRequest("pn-PaperRequestError", requestId)
    if(res.length > 0) {
      for( let j = 0; j < res.length; j++ ){
        let paperError = unmarshall(res[j])
        await awsClient._deleteRequest("pn-PaperRequestError", requestId, paperError.created)
        console.log("Element " + requestId + " with timestamp " + paperError.created + " removed")
      }
    }
    else {
      console.log("Element " + requestId + " not found")
    }  
  }
}

main()