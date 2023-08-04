/**
 * - decodifica address
 * - modifica address
 * - ricodifica address
 * - modifica hash
*/

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { GetCommand, QueryCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const prompt = require('prompt-sync')({sigint: true});
const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");
const { KMSClient, DecryptCommand, EncryptCommand } = require("@aws-sdk/client-kms");
const { marshall } = require("@aws-sdk/util-dynamodb")
const { createHash } =  require('node:crypto')
const { parseArgs } = require('util');

const fs = require('fs')
const jsonDiff = require('json-diff');

const args = ["awsCoreProfile", "envType", "requestId"]
const values = {
  values: { awsCoreProfile, envType, requestId },
} = parseArgs({
  options: {
    awsCoreProfile: {
      type: "string",
      short: "a"
    },
    envType: {
      type: "string",
      short: "e"
    },
    requestId: {
        type: "string",
        short: "i"
      }
  },
});

args.forEach(k => {
    if(!values.values[k]) {
      console.log("Parameter '" + k + "' is not defined")
      console.log("Usage: node index.js --awsCoreProfile <aws-core-profile> --envType <env-type> --requestId <request-id>")
      process.exit(1)
    }
  });

  console.log("Using AWS Core profile: "+ awsCoreProfile)
  console.log("Using Env Type: "+ envType)
  console.log("Using Rquest ID: "+ requestId)


const coreCredentials = fromSSO({ profile: awsCoreProfile })();
const coreDynamoDbClient = new DynamoDBClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});
const coreDDocClient = DynamoDBDocumentClient.from(coreDynamoDbClient);

const cloudformationClient = new CloudFormationClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});

const kmsClient = new KMSClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});

const tableAccountMapping = {
    'pn-PaperRequestDelivery': 'core',
    'pn-PaperAddress': 'core'
}

// address properties
const properties = ['address', 'fullName', 'nameRow2', 'addressRow2', 'cap', 'city', 'city2', 'pr', 'country']

function getClientByTable(tableName){
    const account = tableAccountMapping[tableName]
    if(!account){
        throw new Error("Table not mapped "+tableName)
    }

    if(account==='core'){
        return coreDDocClient
    } 

}

async function getItemFromTable(tableName, keys){
    const client = getClientByTable(tableName)
    const params = {
        TableName: tableName,
        Key: keys
    };
    const ret = await client.send(new GetCommand(params));
    if(ret && ret.Item){
        return ret.Item
    }

    return null
}

async function getKeyArn(){
    // get KMS key as output of Paper Channel storage stack
    // the key is used to encrypt and decrypt data to/from pn-PaperAddress DynamoDB table
    const input = { // DescribeStacksInput
        StackName: "pn-paper-channel-storage-"+envType,
      };
    const command = new DescribeStacksCommand(input);
    const response = await cloudformationClient.send(command);

    const key = response.Stacks[0].Outputs.find((k) => {
        return k.OutputKey==='PCKmsEncDecDynamoDataKeyARN'
    })

    if(key){
        return key.OutputValue
    }

    return null
}

async function getReceiverPaperAddress(requestId){
    // read encrypted receiver address
    const paperReceiverAddress = await getItemFromTable('pn-PaperAddress', {
        requestId: requestId,
        addressType: 'RECEIVER_ADDRESS'
    })

    if(!paperReceiverAddress){
        throw new Error("Missing paper receiver address")
    }

    return paperReceiverAddress    
}

async function getPaperRequestDelivery(requestId){
    // read paper request delivery
    const paperRequestDelivery = await getItemFromTable('pn-PaperRequestDelivery', {
        requestId: requestId
    })

    if(!paperRequestDelivery){
        throw new Error("Missing paper request delivery")
    }

    return paperRequestDelivery    
}

async function getDecodedAddressData(paperReceiverAddress, kmsArn){
    // decrypt pnPaperAddress properties
    const decodedAddressData = {}

    for(let i=0; i<properties.length; i++){
        const property = properties[i]
        if(paperReceiverAddress[property]){
            decodedAddressData[property] = await getDecryptedValue(paperReceiverAddress[property], kmsArn)
        } else {
            console.info('[DECRYPT] missing value '+property)
        }
    }

    return decodedAddressData
}

async function getEncodedAddressData(kmsArn, addressData){
    // encrypt pnPaperAddress properties
    const encryptedAddressData = {}
    for(let i=0; i<properties.length; i++){
        const property = properties[i]
        if(addressData[property]){
            encryptedAddressData[property] = await getEncryptedValue(addressData[property], kmsArn)
        }
    }

    return encryptedAddressData
}

async function getDecryptedValue(value, kmsArn){
    const input = { // DecryptRequest
        CiphertextBlob: Buffer.from(value, 'base64'), 
        KeyId: kmsArn
    };
    const command = new DecryptCommand(input);
    const response = await kmsClient.send(command);

    const buff = Buffer.from(response.Plaintext, 'base64'); 
    const originalText = buff.toString('utf-8'); 
    return originalText
}

async function getEncryptedValue(value, kmsArn){
    const base64Value = Buffer.from(value, 'utf-8').toString('base64')

    const input = { // DecryptRequest
        Plaintext: Buffer.from(base64Value, 'base64'), 
        KeyId: kmsArn
    };
    const command = new EncryptCommand(input);
    const response = await kmsClient.send(command);

    const base64Text = Buffer.from(response.CiphertextBlob).toString('base64'); 
    return base64Text
}

function readNewAddressData(existingDecodedAddressData){
    // read address values from users's prompt, if the users press "returns", the existing value is used
    // LIMITATION: it is not possible to change a not empty value to an empty one (TODO)
    const newAddressData = {}

    for(let i=0; i<properties.length; i++){
        const property = properties[i]
        const v = prompt('Inserire nuovo valore per '+property+ ' ['+ existingDecodedAddressData[property] +'] ')
        if(v){
            newAddressData[property] = v
        } else {
            newAddressData[property] = existingDecodedAddressData[property]
        }
    }

    return newAddressData
}

function getAddressHash(addressData){
    let fullHash = ''

    // the address hash is the concatenation of sha256 of not null address properties previously transformed to lower case and free of "spaces" 
    for(let i=0; i<properties.length; i++){
        const property = properties[i]
        console.log('property '+property, addressData[property])
        const originalString = addressData[property] || ''
        const v = originalString.toLowerCase().replace(/\s/g, '')
        const h = createHash('sha256').update(v).digest('hex')
        fullHash += h
    }

    return fullHash
}

async function writeResults(paperAddress, decodedAddressData, newAddressData, encodedNewAddressData, paperRequestDelivery, updatedPaperRequestDelivery){
    const folder = 'edits/'+requestId+'_'+new Date().toISOString()

    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(folder+'/paperAddress.json', JSON.stringify(marshall(paperAddress), null, 4))
    fs.writeFileSync(folder+'/originalAddress.json', JSON.stringify(decodedAddressData, null, 4))
    fs.writeFileSync(folder+'/updatedAddress.json', JSON.stringify(newAddressData, null, 4))
    fs.writeFileSync(folder+'/updatedEncryptedAddress.json', JSON.stringify(encodedNewAddressData, null, 4))
    fs.writeFileSync(folder+'/paperRequestDelivery.json', JSON.stringify(marshall(paperRequestDelivery), null, 4))
    fs.writeFileSync(folder+'/updatedPaperRequestDelivery.json', JSON.stringify(marshall(updatedPaperRequestDelivery), null, 4))

    fs.writeFileSync(folder+'/addressDiff.diff', jsonDiff.diffString(decodedAddressData, newAddressData, { full: true }))

    return folder
}

async function run(){
    const keyArn = await getKeyArn()    
    console.log('kms key arn', keyArn)

    if(!keyArn){
        throw new Error("Missing key arn")
    }

    const paperReceiverAddress = await getReceiverPaperAddress(requestId)
    console.log('original address data', paperReceiverAddress)

    const decodedAddressData = await getDecodedAddressData(paperReceiverAddress, keyArn)
    console.log('decoded address data', decodedAddressData)

    const newAddressData = readNewAddressData(decodedAddressData)
    console.log('new Address Data', newAddressData)

    const addressDataDiff = []
    properties.forEach((p) => {
        if(decodedAddressData[p]!==newAddressData[p]){
            addressDataDiff[p] = newAddressData[p]
        }
    })

    const encodedNewAddressData = await getEncodedAddressData(keyArn, addressDataDiff)
    console.log('encoded new address data', encodedNewAddressData)
    // copy new encoded values to original paper address
    Object.assign(paperReceiverAddress, encodedNewAddressData)

    const paperRequestDelivery = await getPaperRequestDelivery(requestId)
    console.log('paper request delivery', paperRequestDelivery)

    const updatedAddressHash = getAddressHash(newAddressData)
    console.log('updated Address Hash', updatedAddressHash)
    
    const updatedPaperRequestDelivery = Object.assign({}, paperRequestDelivery)
    updatedPaperRequestDelivery.addressHash = updatedAddressHash

    const folder = await writeResults(paperReceiverAddress, decodedAddressData, newAddressData, encodedNewAddressData, paperRequestDelivery, updatedPaperRequestDelivery)

    console.log('Results available in '+folder+' folder')
}

run()
.then((d) => {
    console.log('data', d)
})