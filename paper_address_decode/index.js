const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const properties = ['address', 'fullName', 'nameRow2', 'addressRow2', 'cap', 'city', 'city2', 'pr', 'country']

async function getDecodedAddressData(awsClient, paperReceiverAddress, kmsArn){
  // decrypt pnPaperAddress properties
  const decodedAddress = {}
  for(let i=0; i<properties.length; i++){
      const property = properties[i]
      if(paperReceiverAddress[property]){  ;
        decodedAddress[property] = await awsClient._getDecryptedValue(paperReceiverAddress[property], kmsArn)
        decodedAddress[property] = Buffer.from(decodedAddress[property].Plaintext, 'base64'); 
        decodedAddress[property] = decodedAddress[property].toString('utf-8')
      } else {
          //console.info('[DECRYPT] missing value '+property)
      }
  }
  return decodedAddress
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
    { name: "fileName", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName },
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
 
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  const paperAddressTableName = "pn-PaperAddress"
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x=> x!='');
  awsClient._initCloudFormation()
  awsClient._initKMS()
  const stackName = `pn-paper-channel-storage-${envName}`
  const result = await awsClient._getKeyArn(stackName)
  const kmsArnKey = result.Stacks[0].Outputs.find((k) => {
    return k.OutputKey==='PCKmsEncDecDynamoDataKeyARN'
  })
  if(!kmsArnKey) { 
    console.log(`arnKey ${stackName} not found`)
    process.exit(1)
  }
  const kmsKey = kmsArnKey.OutputValue
  for(let i = 0; i < fileRows.length; i++){
    const requestId = fileRows[i]
    let paperAddressResponse = await awsClient._queryRequest(paperAddressTableName, "requestId", requestId)
    if(paperAddressResponse.Items.length > 0){ 
      for(const paperAddress of paperAddressResponse.Items) {
        const addressUnmarshalled = unmarshall(paperAddress)
        console.log(addressUnmarshalled.requestId, addressUnmarshalled.addressType )
        const decodedAddress = await getDecodedAddressData(awsClient, addressUnmarshalled, kmsKey)
        console.log(decodedAddress)
      }
    }
  }
}

main();