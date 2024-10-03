const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { encode } = require('punycode');
const { createHash } =  require('node:crypto')

function appendJsonToFile(folder, fileName, data){
  const folderPath = `results/${folder}`
  if(!fs.existsSync(folderPath))
    fs.mkdirSync(folderPath, { recursive: true });
  fs.appendFileSync(`${folderPath}/${fileName}`, data + "\n")
}

const properties = ['address', 'fullName', 'nameRow2', 'addressRow2', 'cap', 'city', 'city2', 'pr', 'country']

function getAddressHash(decodedAddress){
  let fullHash = ''

  // the address hash is the concatenation of sha256 of not null address properties previously transformed to lower case and free of "spaces" 
  for(let i=0; i<properties.length; i++){
      const property = properties[i]
      const originalString = decodedAddress[property] || ''
      const v = originalString.toLowerCase().replace(/\s/g, '')
      const h = createHash('sha256').update(v).digest('hex')
      fullHash += h
  }
  console.log("HASH " + fullHash)
  return fullHash
}

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
          console.info('[DECRYPT] missing value '+property)
      }
  }
  return decodedAddress
}

async function _updateDataTable(awsClient, tableName, item, keyValue, keyData) {
  const keySchema = await awsClient._getKeyFromSchema(tableName)
  let keys = {};
  keySchema.forEach(keyAttribute => {
    keys[keyAttribute.AttributeName] = item[keyAttribute.AttributeName]
  });
  let data = {
    [keyValue]: {
      codeAttr: '#N',
      codeValue: ':n',
      value: keyData
    }
  }
  console.log(
    `
    tableName: ${tableName}
    keys: ${JSON.stringify(keys)}
    data: ${JSON.stringify(data)}
    `
  )
  //await awsClient._updateItem(tableName, keys, data, "SET")
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
        type: "boolean", short: "d", default: false
      },
    },
  });  
  _checkingParameters(args, values)
 
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  awsClient._initCloudFormation()
  awsClient._initKMS()
  const outputPath = fileName.split('.')[0]
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')

  const stackName = `pn-paper-channel-storage-${envName}`
  const paperAddressTableName = "pn-PaperAddress"
  const paperRequestDeliveryTableName = "pn-PaperRequestDelivery"
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
    const requestId =  fileRows[i]
    let paperAddressResponse = await awsClient._queryRequest(paperAddressTableName, "requestId", requestId)
    let paperRequestDelivery = (await awsClient._queryRequest(paperRequestDeliveryTableName, "requestId", requestId)).Items[0]
    if(paperAddressResponse.Items.length > 0){ 
      const encodedAddress = unmarshall(paperAddressResponse.Items.find(x => {
        return x.addressType.S === 'RECEIVER_ADDRESS'
      }))
      const decodedAddress = await getDecodedAddressData(awsClient, encodedAddress, kmsKey)
      if (decodedAddress.nameRow2.length > 44 && !encodedAddress.city2) {
        //to correct
        const nameRow2decodedTruncated = decodedAddress.nameRow2.substring(0, 44)
        const encryptedValueResponse = await awsClient._getEncryptedValue(nameRow2decodedTruncated, kmsKey)
        encodedAddress.nameRow2 = Buffer.from(encryptedValueResponse.CiphertextBlob).toString('base64'); 
        const hashedAddress = getAddressHash(decodedAddress)
        if(!dryrun) {
          //pn-paperAddressCorrection
          await _updateDataTable(awsClient, paperAddressTableName, encodedAddress, 'nameRow2', encodedAddress.nameRow2)
          //pn-paperRequestDeliveryCorrection
          await _updateDataTable(awsClient, paperRequestDeliveryTableName, paperRequestDelivery, 'addressHash', hashedAddress)
        }
        console.log("CORRECTED " + requestId)
        appendJsonToFile(outputPath, "corrected.json", JSON.stringify({
          requestId: requestId,
          nameRow2: encodedAddress.nameRow2,
          addressHash: hashedAddress
        }))
      }
      else if (decodedAddress.nameRow2.length > 44 && encodedAddress.city2) {
        //to analyze
        console.log("TO ANALYZE " + requestId)
        appendJsonToFile(outputPath, "toAnalyze.json", requestId)
      }
      else if (decodedAddress.nameRow2.length < 44 && !encodedAddress.city2) {
        //to raster
        console.log("TO RASTER " + requestId)
        appendJsonToFile(outputPath, "toRaster.json", requestId)
      }
    }
  }
}

main();