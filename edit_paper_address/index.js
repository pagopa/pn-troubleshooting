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
const { createHash } =  require('node:crypto')
const arguments = process.argv;
  
if(arguments.length<=4){
  console.error("Specify AWS profile")
  console.log("node index.js <aws-core-profile> <env> <request-id>")
  process.exit(1)
}

const awsCoreProfile = arguments[2]
const envType = arguments[3]
const requestId = arguments[4]

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

/*

        return Utility.convertToHash(this.address) +
                Utility.convertToHash(this.fullName) +
                Utility.convertToHash(this.nameRow2) +
                Utility.convertToHash(this.addressRow2) +
                Utility.convertToHash(this.cap) +
                Utility.convertToHash(this.city) +
                Utility.convertToHash(this.city2) +
                Utility.convertToHash(this.pr) +
                Utility.convertToHash(this.country);
*/

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

async function queryItemFromTable(tableName, keys){
    const client = getClientByTable(tableName)
    const expressionAttributes = {}
    Object.entries(keys).forEach((k) => {
        expressionAttributes[':'+k[0]] = k[1]
    })

    const params = {
        TableName: tableName,
        KeyConditionExpression: Object.entries(keys).map((k) => {
            return k[0]+' = :'+k[0]
        }).join(', '),
        ExpressionAttributeValues: expressionAttributes
    };

    console.log('params', params)
    const ret = await client.send(new QueryCommand(params));
    if(ret && ret.Items){
        return ret.Items
    }

    return []
}

async function getUpdatedAddressData(requestId, newAddressData = {}){
    const paperReceiverAddress = await getItemFromTable('pn-PaperAddress', {
        requestId: requestId,
        addressType: 'RECEIVER_ADDRESS'
    })
    console.debug('paperReceiverAddress '+requestId)
}

async function getKeyArn(){
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

async function getDecodedAddressData(kmsArn){
    const paperReceiverAddress = await getItemFromTable('pn-PaperAddress', {
        requestId: requestId,
        addressType: 'RECEIVER_ADDRESS'
    })

    if(!paperReceiverAddress){
        throw new Error("Missing paper receiver address")
    }

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
    const encryptedAddressData = {}
    for(let i=0; i<properties.length; i++){
        const property = properties[i]
        if(addressData[property]){
            encryptedAddressData[property] = await getEncryptedValue(addressData[property], kmsArn)
        } else {
            console.log('[ENCRYPT] empty value for '+property)
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

    console.log('base64Value', base64Value)
    const input = { // DecryptRequest
        Plaintext: Buffer.from(base64Value, 'base64'), 
        KeyId: kmsArn
    };
    const command = new EncryptCommand(input);
    const response = await kmsClient.send(command);

    console.log(response.CiphertextBlob)

    const base64Text = Buffer.from(response.CiphertextBlob).toString('base64'); 
    return base64Text
}

function readNewAddressData(existingDecodedAddressData){
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

async function run(){
    const keyArn = await getKeyArn()    
    console.log('kms key arn', keyArn)

    if(!keyArn){
        throw new Error("Missing key arn")
    }

    const decodedAddressData = await getDecodedAddressData(keyArn)
    console.log('decoded address data', decodedAddressData)

    const newAddressData = readNewAddressData(decodedAddressData)
    console.log('new Address Data', newAddressData)

    const encodedNewAddressData = await getEncodedAddressData(keyArn, newAddressData)
    console.log('encoded new address data', encodedNewAddressData)

    const updatedAddressHash = getAddressHash(newAddressData)
    console.log('updated Address Hash', updatedAddressHash)

}

run()
.then((d) => {
    console.log('data', d)
})