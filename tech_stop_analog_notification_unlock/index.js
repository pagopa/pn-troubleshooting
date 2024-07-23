const { AwsClientsWrapper } = require("pn-common");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require("@aws-sdk/util-dynamodb");

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

const failedRequestIds = []

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
        type: "boolean", short: "f", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'confinfo', envName );
  awsClient._initDynamoDB()
  console.log('Reading from file...')
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  const tableName = "pn-EcRichiesteMetadati"
  const keySchema = await awsClient._getKeyFromSchema(tableName)
  for(let i = 0; i < fileRows.length; i++){
    const requestId = fileRows[i]
    let res = await awsClient._queryRequest(tableName, "requestId", "pn-cons-000~" + requestId)
    if(res.Items.length > 0) {
      const ecRichiesteMetadati = unmarshall(res.Items[0])
      if(ecRichiesteMetadati.statusRequest !== 'PN999') {
        console.log(`Request id ${requestId} is not in status PN999 but ${ecRichiesteMetadati.statusRequest}`)
        continue;
      }
      let keys = {};
      keySchema.forEach(keyAttribute => {
        keys[keyAttribute.AttributeName] = ecRichiesteMetadati[keyAttribute.AttributeName]
      });
      let data = {
        lastUpdateTimestamp: {
          codeAttr: '#D',
          codeValue: ':d',
          value: new Date().toISOString()
        },
        statusRequest: {
          codeAttr: '#S',
          codeValue: ':S',
          value: "P000"
        },
      }
      if(!dryrun) {
        const res = await awsClient._updateItem(tableName, keys, data, "SET")
        console.log(`For ${JSON.stringify(keys)}`)
        console.log(`Updated Item from ${ecRichiesteMetadati.statusRequest} to ${res.Attributes.statusRequest.S}`)
      }
      else {   
        console.log(`For ${JSON.stringify(keys)}`)
        console.log(`Updated Item from ${ecRichiesteMetadati.statusRequest} to ${data.statusRequest.value}`)
      }
    }
  }
}

main()