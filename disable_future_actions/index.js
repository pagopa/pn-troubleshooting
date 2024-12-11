const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { _parseCSV } = require('pn-common/libs/utils');

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
    values: { envName, fileName, days, dryrun },
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
  const awsClient = new AwsClientsWrapper( 'core', envName );
  const tableName = "pn-FutureAction"
  awsClient._initDynamoDB()
  const keySchema = await awsClient._getKeyFromSchema(tableName)
  const datas = await _parseCSV(fileName, ",")
  console.log(keySchema)
  for(let i = 0; i < datas.length; i++){
    let data = datas[i]
    let keys = {}
    for(const key of keySchema) {
      keys[key.AttributeName] = {
          codeAttr: `#${key.KeyType}`,
          codeValue: `:${key.KeyType}`,
          value: data[key.AttributeName],
          operator: "="
      }
    }
    console.log(keys)
    let result = await awsClient._dynamicQueryRequest(tableName, keys, "and")
    if(result.Items.length > 0){ 
      for(let z = 0; z < result.Items.length; z++ ) {
        let item = unmarshall(result.Items[z])
        appendJsonToFile('backup.json', JSON.stringify(item))
        let keys = {};
        keySchema.forEach(keyAttribute => {
          keys[keyAttribute.AttributeName] = item[keyAttribute.AttributeName]
        });
        let data = {
          logicalDeleted: {
            codeAttr: '#T',
            codeValue: ':t',
            value: true
          }
        }
        if(!dryrun) {
          const res = await awsClient._updateItem(tableName, keys, data, "SET")
          console.log(`For ${JSON.stringify(keys)}`)
          console.log(`logicalDeleted setted True`)
        }
        else {
          console.log(`DRYRUN: For ${JSON.stringify(keys)}`)
          console.log(`DRYRUN: logicalDeleted setted True `)
        }
      }
    }
    else {
      console.log(`RequestId ${requestId} not found`)
    }
  }
}

main();