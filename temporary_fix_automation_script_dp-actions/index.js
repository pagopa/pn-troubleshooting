const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function prepareTtl(dateInMs, days) { 
  let date = new Date(dateInMs)
  date.setDate(date.getDate() + days)
  return date.getTime() / 1000
}

function appendJsonToFile(fileName, data){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync("results/" + fileName, data + "\n")
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
        type: "boolean", short: "n", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'confinfo', envName );
  awsClient._initDynamoDB()
  const tableName = "pn-SsDocumenti"
  const keySchema = await awsClient._getKeyFromSchema(tableName)
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const fileKey =  fileRows[i]
    let result = await awsClient._queryRequest(tableName, "documentKey", fileKey)
    if(result.Items.length > 0){ 
      for(let z = 0; z < result.Items.length; z++ ) {
        let item = unmarshall(result.Items[z])
        appendJsonToFile('backup.json', JSON.stringify(item))
        let keys = {};
        keySchema.forEach(keyAttribute => {
          keys[keyAttribute.AttributeName] = item[keyAttribute.AttributeName]
        });
        let data = {
          documentState: {
            codeAttr: '#D',
            codeValue: ':d',
            value: "attached"
          }
        }
        if(!dryrun) {
          const res = await awsClient._updateItem(tableName, keys, data, "SET")
          console.log(`Document state for document ${JSON.stringify(keys)} updated to attached`)
        }
        else {
          console.log(`DRYRUN: Document state for document ${JSON.stringify(keys)} updated to attached`)
        }
      }
    }
    else {
      console.log(`Document ${fileKey} not found`)
    }
  }
}

main();