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
    { name: "days", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, days},
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
      
      result.Items.forEach(async e => {
        let item = unmarshall(e)
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
        const res = await awsClient._updateItem("pn-PaperAddress", keys, data, "SET")
        console.log(`For ${JSON.stringify(keys)}`)
        console.log(`TTL modified from ${new Date(item.ttl).toISOString()} to ${new Date(res.Attributes.ttl.N * 1000).toISOString()}`)
      })
      
    }
  }
}

main();