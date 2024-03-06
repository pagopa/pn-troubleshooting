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
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--dryrun] "
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
        type: "boolean", short: "d", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  
  console.log('Reading from file...')
  let counter = 0
  const requestIdx = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  for( let i = 0; i < requestIdx.length; i++ ){
    const requestId = requestIdx[i]
    const res = await awsClient._queryRequest("pn-PaperRequestError", requestId)
    if(res.length > 0) {
      for( let j = 0; j < res.length; j++ ){
        let paperError = unmarshall(res[j])
        if(dryrun) {
          counter = counter + 1
          console.log("Dryrun Removing " + requestId + " " + paperError.created)
        }
        else {
          counter = counter + 1
          await awsClient._deleteRequest("pn-PaperRequestError", requestId, paperError.created)
          console.log("Element " + requestId + " with timestamp " + paperError.created + " removed")
        }
      }
    }
    else {
      console.log("Element " + requestId + " not found")
    }  
  }
  console.log("Removed " + counter + " elements")
}

main()