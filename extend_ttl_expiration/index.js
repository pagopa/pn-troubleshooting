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
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --days <days> [--dryrun]"
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
    { name: "days", mandatory: true, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] },

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
      },
      days: {
        type: "string", short: "d", default: undefined
      },
      dryrun: {
        type: "boolean", short: "n", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  const keySchema = await awsClient._getKeyFromSchema("pn-PaperAddress")
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const requestId =  fileRows[i]
    let result = await awsClient._queryRequest("pn-PaperAddress", "requestId", requestId)
    if(result.Items.length > 0){ 
      for(let z = 0; z < result.Items.length; z++ ) {
        let item = unmarshall(result.Items[z])
        appendJsonToFile('backup.json', JSON.stringify(item))
        item.ttl = item.ttl * 1000 //convert to milliseconds
        let keys = {};
        keySchema.forEach(keyAttribute => {
          keys[keyAttribute.AttributeName] = item[keyAttribute.AttributeName]
        });
        let data = {
          ttl: {
            codeAttr: '#T',
            codeValue: ':t',
            value: prepareTtl(item.ttl, Number(days))
          }
        }
        if(!dryrun) {
          const res = await awsClient._updateItem("pn-PaperAddress", keys, data, "SET")
          console.log(`For ${JSON.stringify(keys)}`)
          console.log(`TTL modified from ${new Date(item.ttl).toISOString()} to ${new Date(res.Attributes.ttl.N * 1000).toISOString()}`)
        }
        else {
          console.log(`DRYRUN: For ${JSON.stringify(keys)}`)
          console.log(`DRYRUN: TTL modified from ${new Date(item.ttl).toISOString()} to ${new Date(prepareTtl(item.ttl, Number(days)) * 1000).toISOString()}`)
        }
      }
    }
    else {
      console.log(`RequestId ${requestId} not found`)
    }
  }
}

main();