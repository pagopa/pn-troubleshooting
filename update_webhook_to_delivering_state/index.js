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
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --documentState <document-state> [--dryrun]"
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
    { name: "accountType", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] },

  ]
  const values = {
    values: { envName, accountType, fileName, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      accountType: {
        type: "string", short: "a", default: undefined
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
  const awsClient = new AwsClientsWrapper( accountType, envName );
  
  awsClient._initDynamoDB()
  
  const tableName = 'pn-WebhookEvents'
  const keySchema = await awsClient._getKeyFromSchema(tableName)
  
  const datas = await _parseCSV(fileName, ",")
  for(const data of datas){
    const pkField = keySchema.find(k => k.KeyType === "HASH")?.AttributeName;
    const skField = keySchema.find(k => k.KeyType === "RANGE")?.AttributeName;

    let result = await awsClient._queryRequest(tableName, pkField, data[pkField], skField, data[skField])

    if (result.Items.length == 0) {
      console.log(`Element with ${pkField}=${data[pkField]} ${skField}=${data[skField]} not found`)
    }
    for (const record of result.Items) {
      const item = unmarshall(record)
      appendJsonToFile('backup.json', JSON.stringify(item))
      
      const keys = Object.fromEntries(
        keySchema.map(({ AttributeName }) => [AttributeName, item[AttributeName]])
      );
      
      const status = 'DELIVERING'
      const elementUpdated = item['element'].replace("RETURNED_TO_SENDER", status)

      const dataToUpdate = {
        newStatus: {
          codeAttr: '#D',
          codeValue: ':d',
          value: status
        },
        element: {
          codeAttr: '#x',
          codeValue: ':x',
          value: elementUpdated
        }
        
      }
      if(!dryrun) {
        await awsClient._updateItem(tableName, keys, dataToUpdate, "SET")
        appendJsonToFile('updated.txt', JSON.stringify(keys))
        console.log("Updated:", keys);
      }
      else {
        console.log("DRYRUN: updated", keys)
      }
    }
  }
}

main();