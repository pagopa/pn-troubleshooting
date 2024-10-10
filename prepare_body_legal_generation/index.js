const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync("results/" + fileName, data + "\n")
}

function prepareBody(item) {
  return {
    Body: {
      documentEntity: item,
      oldDocumentState: "staged"
    }
  }
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
    values: { envName, fileName, days, dryrun },
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
  const awsClient = new AwsClientsWrapper( 'confinfo', envName );
  awsClient._initDynamoDB()
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x=> x!="");
  for(let i = 0; i < fileRows.length; i++){
    const fileKey = fileRows[i]
    let result = await awsClient._queryRequest("pn-SsDocumenti", "documentKey", fileKey)
    if(result.Items.length > 0){ 
      console.log(`FileKey ${fileKey} found`)
      for(const tmp of result.Items) {
        const item = unmarshall(tmp)
        if(item.documentState == 'available') {
          const body = prepareBody(item)
          appendJsonToFile("result.json", JSON.stringify(body))
        }
        else {
          appendJsonToFile("error.json", fileKey)
          console.log(`FileKey ${fileKey} not in document state "available"`)
        }
      }
    }
    else {
      appendJsonToFile("error.json", fileKey)
      console.log(`FileKey ${fileKey} not found`)
    }
  }
}

main();