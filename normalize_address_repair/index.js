const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { _getIunFromRequestId } = require('pn-common/libs/utils.js');
const { ApiClient } = require("./libs/api");
require('dotenv').config()

const { createHash } =  require('node:crypto')

const properties = ['address', 'fullName', 'nameRow2', 'addressRow2', 'cap', 'city', 'city2', 'pr', 'country']

async function retrieveConfidentialAddress(awsClient, timelineId) {
  const res = await awsClient._queryRequest("pn-ConfidentialObjects", "hashKey", timelineId)
  return res.Items
  // Implementation for retrieving addresses
}

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

function prepareAddressForNorm(address) {
  //add field only if exists
  const preparedAddress = {};
  if (address.address) preparedAddress.addressRow = address.address; //OK
  if (address.at) preparedAddress.at = address.at;
  if (address.cap) preparedAddress.cap = address.cap; //OK
  if (address.province) preparedAddress.pr = address.province; //OK
  if (address.municipality) preparedAddress.city = address.municipality; //OK
  if (address.addressDetails) preparedAddress.addressRow2 = address.addressDetails; //OK
  if (address.municipalityDetails) preparedAddress.city2 = address.municipalityDetails; //OK
  if (address.state) preparedAddress.country = address.state; //OK
  return preparedAddress;
}

function prepareAddressForConf(address) {
  console.log(address)
  return {
    address: address.addressRow,
    at: address.at || null,
    cap: address.cap || null,
    pr: address.pr || null,
    municipality: address.city || null,
    addressDetails: address.addressRow2 || null,
    municipalityDetails: address.city2 || null,
    country: address.country || null
  }
}

//format method to update confidential object
async function updateConfidential(awsClient, keySchema, unmarshalledItem, address, addressRow2, nameRow2, cap) {
  let data = {}
  let keys = {};
  keySchema.forEach(keyAttribute => {
    keys[keyAttribute.AttributeName] = unmarshalledItem[keyAttribute.AttributeName]
  })
  if (unmarshalledItem.sortKey.startsWith("NORMALIZED_ADDRESS")) {
    unmarshalledItem.newPhysicalAddress["address"] = address
    if (addressRow2) unmarshalledItem.newPhysicalAddress["addressDetails"] = addressRow2
    if (nameRow2) unmarshalledItem.newPhysicalAddress["at"] = nameRow2
    if (cap) unmarshalledItem.newPhysicalAddress["cap"] = cap
    data = {
      newPhysicalAddress: {
        codeAttr: '#T',
        codeValue: ':t',
        value: unmarshalledItem.newPhysicalAddress
      }
    }
  }
  else {
    if (unmarshalledItem.sortKey.startsWith("SEND_ANALOG_DOMICILE")) {
      addressRow2 ? unmarshalledItem.physicalAddress["addressDetails"] = addressRow2 : unmarshalledItem.physicalAddress["addressDetails"] = null
      cap ? unmarshalledItem.physicalAddress["cap"] = cap : unmarshalledItem.physicalAddress["cap"] = null
      nameRow2 ? unmarshalledItem.physicalAddress["at"] = nameRow2 : unmarshalledItem.physicalAddress["at"] = null
    }
    else {
      unmarshalledItem.physicalAddress["addressDetails"] = addressRow2
      cap ? unmarshalledItem.physicalAddress["cap"] = cap : unmarshalledItem.physicalAddress["cap"] = null
      nameRow2 ? unmarshalledItem.physicalAddress["at"] = nameRow2 : unmarshalledItem.physicalAddress["at"] = null
    }
    data = {
      physicalAddress: {
        codeAttr: '#T',
        codeValue: ':t',
        value: unmarshalledItem.physicalAddress
      }
    }
  }
  await awsClient._updateItem("pn-ConfidentialObjects", keys, data, 'SET')
}

async function _updatePaperTable(awsClient, tableName, keySchema, item, column, value) {
  let keys = {};
  keySchema.forEach(keyAttribute => {
    keys[keyAttribute.AttributeName] = item[keyAttribute.AttributeName]
  });
  let data = {
    [column]: {
      codeAttr: '#N',
      codeValue: ':n',
      value: value
    }
  }
  console.log(data)
  await awsClient._updateItem(tableName, keys, data, "SET")
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
 
  const clients = {
    core: new AwsClientsWrapper( 'core', envName ),
    confinfo: new AwsClientsWrapper( 'confinfo', envName )
  }

  //PREPARE DATA
  clients.confinfo._initDynamoDB()
  clients.core._initDynamoDB()
  clients.core._initKMS()
  clients.core._initCloudFormation()
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x=> x!='');
  const keySchemaConfidential = await clients.confinfo._getKeyFromSchema('pn-ConfidentialObjects')
  const keySchemaPaper = await clients.core._getKeyFromSchema('pn-PaperAddress')
  const keySchemaRequestDelivery = await clients.core._getKeyFromSchema('pn-PaperRequestDelivery')

  const stackName = `pn-paper-channel-storage-${envName}`
  const result = await clients.core._getKeyArn(stackName)
  const kmsArnKey = result.Stacks[0].Outputs.find((k) => {
    return k.OutputKey==='PCKmsEncDecDynamoDataKeyARN'
  })
  if(!kmsArnKey) { 
    console.log(`arnKey ${stackName} not found`)
    process.exit(1)
  }
  const kmsKey = kmsArnKey.OutputValue
  //UPDATE CONFIDENTIAL OBJECT
  for(const reqId of fileRows) {
    console.log(reqId)
    let address;
    let addressRow2;
    let nameRow2;
    const iun = _getIunFromRequestId(reqId)
    const requestId = reqId.split(".PCRETRY")[0]
    const notifyConf = await retrieveConfidentialAddress(clients['confinfo'], "NOTIFY#" + iun)

    if(!notifyConf || notifyConf.length==0) {
      console.log(`No address found for requestId ${reqId} iun ${iun}`)
      continue
    }
    for(const item of notifyConf) {
      const unmarshalledPhysicalAddress = unmarshall(item).physicalAddress
      const res = await ApiClient.callAddressManager(process.env.BASE_URL, reqId, prepareAddressForNorm(unmarshalledPhysicalAddress))
      //check cap from calladdressmanager response and notifyConf
      console.log(res)
      if(res.normalizedAddress !== null) {
        const cap = res.normalizedAddress.cap
        const notifyCap = unmarshalledPhysicalAddress.cap
        if(cap !== notifyCap) {
          console.log(`CAP mismatch ${notifyCap}-${cap} for requestId ${reqId} iun ${iun} address ${JSON.stringify(unmarshalledPhysicalAddress)}`)
          continue
        }
      }
      if(res.normalizedAddress === null) {
        console.log(`No normalized address found for requestId ${reqId} iun ${iun} address ${JSON.stringify(unmarshalledPhysicalAddress)}`)
        continue
      }
      //const addressToConfObj = prepareAddressForConf(res.normalizedAddress)
      address = res.normalizedAddress['addressRow']
      addressRow2 = res.normalizedAddress['addressRow2']
      nameRow2 = res.normalizedAddress['nameRow2']
      const timelineConf = (await retrieveConfidentialAddress(clients['confinfo'], "TIMELINE#" + iun)).filter(x => {
        const unmarshalledItem = unmarshall(x)
        return unmarshalledItem.sortKey.startsWith("NORMALIZED_ADDRESS") || 
        ((unmarshalledItem.sortKey.startsWith("SEND_ANALOG_DOMICILE") || unmarshalledItem.sortKey.startsWith("PREPARE_ANALOG_DOMICILE")) && unmarshalledItem.sortKey.endsWith("ATTEMPT_0"))
      })
      if(timelineConf && timelineConf.length>0) {
        for(const timelineItem of timelineConf) {
          const unmarshalledItem = unmarshall(timelineItem)
          await updateConfidential(clients['confinfo'], keySchemaConfidential, unmarshalledItem, address, addressRow2, nameRow2, cap)
        }
      }
      let paperAddressResponse = await clients.core._queryRequest('pn-PaperAddress', "requestId", requestId)
      let paperRequestDeliveryResponse = await clients.core._queryRequest('pn-PaperRequestDelivery', "requestId", requestId)

      const receiverAddresses = paperAddressResponse.Items.filter(x => {
        const addressUnmarshalled = unmarshall(x)
        return addressUnmarshalled.addressType === 'RECEIVER_ADDRESS'
      })
      if(receiverAddresses.length > 0){ 
        for(const rec of receiverAddresses) {
          const receiverAddressUnmarshalled = unmarshall(rec)
          const decodedAddress = await getDecodedAddressData(clients.core, receiverAddressUnmarshalled, kmsKey)
          //encode address
          const encryptedValueResponse = await clients.core._getEncryptedValue(address, kmsKey)
          const addressEncoded = Buffer.from(encryptedValueResponse.CiphertextBlob).toString('base64');
          decodedAddress.address = addressEncoded 
          _updatePaperTable(clients.core, 'pn-PaperAddress', keySchemaPaper, receiverAddressUnmarshalled, 'address', addressEncoded)
          if (addressRow2) {
            const encryptedValueResponseRow2 = await clients.core._getEncryptedValue(addressRow2, kmsKey)
            const addressRow2Encoded = Buffer.from(encryptedValueResponseRow2.CiphertextBlob).toString('base64');
            decodedAddress.addressRow2 = addressRow2Encoded
            _updatePaperTable(clients.core, 'pn-PaperAddress', keySchemaPaper, receiverAddressUnmarshalled, 'addressRow2', addressRow2Encoded)
          } else {
            delete decodedAddress.addressRow2
          }
          if (nameRow2) {
            const encryptedValueResponseNameRow2 = await clients.core._getEncryptedValue(nameRow2, kmsKey)
            const nameRow2Encoded = Buffer.from(encryptedValueResponseNameRow2.CiphertextBlob).toString('base64');
            decodedAddress.nameRow2 = nameRow2Encoded
            _updatePaperTable(clients.core, 'pn-PaperAddress', keySchemaPaper, receiverAddressUnmarshalled, 'nameRow2', nameRow2Encoded)
          } else {
            delete decodedAddress.nameRow2
          }
          const hashedAddress = getAddressHash(decodedAddress)
          console.log(unmarshall(paperRequestDeliveryResponse.Items[0]))
          _updatePaperTable(clients.core, 'pn-PaperRequestDelivery', keySchemaRequestDelivery, unmarshall(paperRequestDeliveryResponse.Items[0]), 'addressHash', hashedAddress)
        }
      }
    }
  }
  
}

main();
