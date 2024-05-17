const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");
const { KMSClient, DecryptCommand, EncryptCommand } = require("@aws-sdk/client-kms");
const { parseArgs } = require('util');
const { ApiClient } = require("./libs/api");
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");

const fs = require('fs')
const jsonDiff = require('json-diff');


const args = [
    { name: "awsCoreProfile", mandatory: true },
    { name: "envType", mandatory: true },
    { name: "requestId", mandatory: true },
    { name: "update", mandatory: false }
]
const values = {
  values: { awsCoreProfile, envType, requestId, update },
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
    },
    update: {
        type: "boolean",
        default: false,
        short: "w"
    }
  },
});


const urls = {
    uat: {
      pdv: 'https://api.uat.tokenizer.pdv.pagopa.it',
      selfcare: 'https://api.uat.selfcare.pagopa.it'
    },
    hotfix: {
      pdv: 'https://api.uat.tokenizer.pdv.pagopa.it',
      selfcare: 'https://api.uat.selfcare.pagopa.it'
    },
    prod: {
      pdv: 'https://api.tokenizer.pdv.pagopa.it',
      selfcare: 'https://api.selfcare.pagopa.it'
    },
    dev: {
        pdv: 'https://api.uat.tokenizer.pdv.pagopa.it',
        selfcare: 'https://api.uat.selfcare.pagopa.it'
      },
  }

  const baseUrlSelfcare = envType == 'prod' ? urls.prod.selfcare : urls.uat.selfcare
  const baseUrlPDV = envType == 'prod' ? urls.prod.pdv: urls.uat.pdv

args.forEach(k => {
    if (k.mandatory && !values.values[k.name]) {
      console.log("Parameter '" + k.name + "' is not defined")
      console.log("Usage: node index.js --awsCoreProfile <aws-core-profile> --envType <env-type> --requestId <request-id> [--update]")
      process.exit(1)
    }
  });

  console.log("Using AWS Core profile: "+ awsCoreProfile)
  console.log("Using Env Type: "+ envType)
  console.log("Using Rquest ID: "+ requestId)
  console.log("Using Write Operation on DynamoDB : "+ update)


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

    const paperRequestDelivery = await getPaperRequestDelivery(requestId)
    console.log('paper request delivery', paperRequestDelivery)

    let cxId = paperRequestDelivery.fiscalCode;
    console.log('Fiscal Code: ', cxId)
    
    const awsClient = new AwsClientsWrapper("dev");
    const apiKeys = await awsClient._getSecretKey('pn-PersonalDataVault-Secrets')
    const secrets =  {
        apiKeyPF: apiKeys.TokenizerApiKeyForPF,
        apiKeyPG: apiKeys.SelfcareApiKeyForPG
    }
    
    let res;
    let fiscalCode = "";
    if(cxId.startsWith('PF')) {
        res = await ApiClient.decodeUID(cxId, baseUrlPDV, secrets.apiKeyPF)
        fiscalCode = res.pii
    } else {
        res = await ApiClient.decodeUID(cxId, baseUrlSelfcare, secrets.apiKeyPG)
        fiscalCode = res.taxCode
    }

    console.log('decode FiscalCode response', fiscalCode)


    let nrResponse = await ApiClient.callNr(cxId,fiscalCode,'http://localhost:8888')
    console.log("NR response: "+JSON.stringify(nrResponse.residentialAddresses));


    return;
    
}
    

run()
.then((d) => {
    console.log('data', d)
})