const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { appendJsonToFile } = require('pn-common/libs/utils');

function normalizeResult(items) {
  const tmp = []
  for(const value of items) {
    tmp.push(unmarshall(value))
  }
  return tmp
}
function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --account <account> --fileName <file-name> --tableName <tableName> --keyName <keyName> [--prefix <prefix> --suffix <suffix>]"
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
    { name: "account", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "tableName", mandatory: true, subcommand: [] },
    { name: "keyName", mandatory: true, subcommand: [] },
    { name: "prefix", mandatory: false, subcommand: [] },
    { name: "suffix", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, account, fileName, tableName, keyName, prefix, suffix },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      }, 
      account: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      tableName: {
        type: "string", short: "t", default: undefined
      },
      keyName: {
        type: "string", short: "k", default: undefined
      },
      prefix: {
        type: "string", short: "p", default: ''
      },
      suffix: {
        type: "string", short: "s", default: ''
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( account, envName );
  awsClient._initDynamoDB()
  const now = new Date().toISOString()
  const pks = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x=>x!='')
  let i = 1;
  for(const pk of pks) {
    const keyValue = `${prefix}${pk}${suffix}`
    console.log(`Searching for item ${i}: ${keyValue}`)
    const result = await awsClient._queryRequest(tableName, keyName, keyValue)
    if(result.Items.length > 0) {
      const items = normalizeResult(result.Items)
      for(const i of items) {
        appendJsonToFile(`result/${envName}-${now}`, `${tableName}`, JSON.stringify(i))
      }
    }
    i = i + 1;
  }
}

main();