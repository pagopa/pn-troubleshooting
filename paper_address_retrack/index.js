const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { _getIunFromRequestId } = require('pn-common/libs/utils');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

const MAPPING_KEYS = {
  fullName: "fullName",
  address: "address",
  addressDetails: "addressRow2",
  cap: "cap",
  municipality: "city",
  municipalityDetails: "city2",
  province: "pr",
  at: "nameRow2",
  country: "state",
  state: "country",
  requestId: "requestId",
  addressType: "addressType",
  ttl: "ttl"
}
const BASIC_ADDRESS = {
  address: "Via Sardegna n. 38",
  cap: "00187",
  municipality: "Roma",
  province: "Roma",
  state: "Italia",
  fullName: "PagoPA S.p.A.",
}
const ADDRESS_TYPES = ["SENDER_ADDRESS", "AR_ADDRESS"]


async function encryptValues(awsClient, item, kmsKey) {
  const encryptedValues = {}
  
  //iterate over item keys and encrypt each value
  for (const key of Object.keys(item)) {
    console.log(`Encrypting key ${key} with value ${item[key]}`)
    if(item[key]===null || item[key]===undefined || item[key]==='') {
      continue
    }   
    const encryptedValueResponse = await awsClient._getEncryptedValue(item[key], kmsKey)
    encryptedValues[key] = Buffer.from(encryptedValueResponse.CiphertextBlob).toString('base64');
  }
  return encryptedValues
}

function getDenominationFromMarshall(item) {
   return unmarshall(item).denomination
}

async function preparePaperAddress(awsClient, kmsKey, requestId, addressType, encryptedAddress, ttl) {
  const paperAddress = {}
  console.log(`Preparing paper address for requestId ${requestId} and addressType ${addressType}`)
  console.log(encryptedAddress)

  //add elemets only if present in encryptedAddress mapping correctly
  for(const key of Object.keys(encryptedAddress)) {
    paperAddress[MAPPING_KEYS[key]] = encryptedAddress[key]
  }
  console.log(paperAddress)
  const encryptedValues = await encryptValues(awsClient, paperAddress, kmsKey)
  encryptedValues.requestId = requestId;
  encryptedValues.addressType = addressType;
  encryptedValues.ttl = ttl;
  return encryptedValues;
}

function paperAddressMapping(paperAddress) {
  //map to dynamodb marshall format removing null or undefined or '' values
  const filteredAddress = {}
  for(const key of Object.keys(paperAddress)) {
    if(paperAddress[key]!==null && paperAddress[key]!==undefined && paperAddress[key]!=='') {
      filteredAddress[key] = paperAddress[key]
    }
  }

  return marshall(filteredAddress);
}

async function retrieveConfidential(awsClient, requestId) {
  const iun = _getIunFromRequestId(requestId);
  const confidentialObjectsTableName = "pn-ConfidentialObjects"
  const requestIdConfidential = await awsClient._queryRequest(confidentialObjectsTableName, "hashKey", `TIMELINE#${iun}`, "sortKey", requestId)
  const notifyConfidential = await awsClient._queryRequest(confidentialObjectsTableName, "hashKey", `NOTIFY#${iun}`)
  if(requestIdConfidential.Items.length == 0 || notifyConfidential.Items.length == 0){
    console.log(`Confidential item for requestId ${requestId} not found`)
    process.exit(1)
  }
  const unmashalledItem = unmarshall(requestIdConfidential.Items[0])
  unmashalledItem.physicalAddress['fullName'] = getDenominationFromMarshall(notifyConfidential.Items[0])
  return unmashalledItem
}

async function handleRequest(awsClient, requestId, kmsKey, confidentialItem){
  const ttl = Math.floor(Date.now() / 1000) + 6 * 30 * 24 * 60 * 60 // 6 months
  const items = []
  let paperAddress;
  for(const addressType of ADDRESS_TYPES) {
    const item = await preparePaperAddress(awsClient, kmsKey, requestId, addressType, BASIC_ADDRESS, ttl)
    paperAddress = paperAddressMapping(item)
    items.push({PutRequest: {Item: paperAddress}})
  } 
  switch (true) {
    case requestId.startsWith("PREPARE_SIMPLE_REGISTERED_LETTER"):
      const encryptedAddress = await preparePaperAddress(awsClient, kmsKey, requestId, "RECEIVER_ADDRESS", confidentialItem.physicalAddress, ttl)
      paperAddress = paperAddressMapping(encryptedAddress)
      items.push({PutRequest: {Item: paperAddress}})
      await awsClient._batchWriteItem("pn-PaperAddress", items)
      console.log(`Inserted paper address for requestId: ${requestId}`)
      break;
    case requestId.includes("ATTEMPT_1"):
      // TODO
      console.log(`ATTEMPT_1 handling not implemented yet for requestId: ${requestId}`)
      break;
    case requestId.includes("ATTEMPT_0"):
      console.log(`ATTEMPT_0 handling not implemented yet for requestId: ${requestId}`)
      break;
    default:
      console.log(`RequestId ${requestId} not managed, skipping.`)
      break;
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

async function getKeyArn(awsClient, stackName) {
  const result = await awsClient._getKeyArn(stackName)
  const kmsArnKey = result.Stacks[0].Outputs.find((k) => {
    return k.OutputKey==='PCKmsEncDecDynamoDataKeyARN'
  })
  if(!kmsArnKey) { 
    console.log(`arnKey ${stackName} not found`)
    process.exit(1)
  }
  return kmsArnKey.OutputValue
}

async function initClients(envName) {
  const awsClients = {}
  awsClients['core'] = new AwsClientsWrapper( 'core', envName );
  awsClients['confinfo'] = new AwsClientsWrapper( 'confinfo', envName );
  awsClients['core']._initDynamoDB()
  awsClients['confinfo']._initDynamoDB()
  awsClients['core']._initCloudFormation()
  awsClients['core']._initKMS()
  return awsClients
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
  const awsClients = await initClients(envName)
  const paperAddressTableName = "pn-PaperAddress"
  const kmsKey = await getKeyArn(awsClients['core'], `pn-paper-channel-storage-${envName}`)
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x=> x!='');
  for(let i = 0; i < fileRows.length; i++){
    const requestId = fileRows[i]
    let confidentialItem = await retrieveConfidential(awsClients['confinfo'], requestId)
    let paperAddressAvailable = await awsClients['core']._queryRequest(paperAddressTableName, "requestId", requestId)
    if(paperAddressAvailable.Items.length > 0){
      console.log(`${requestId} already present in ${paperAddressTableName}, skipping retrack.`)
      continue
    }
    console.log(`Retracking paper address for requestId: ${requestId}`)
    await handleRequest(awsClients['core'], requestId, kmsKey, confidentialItem)
    console.log(`Retracked paper address for requestId: ${requestId}`)
  }
}

main();