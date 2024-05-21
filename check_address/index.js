const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");
const { KMSClient, DecryptCommand, EncryptCommand } = require("@aws-sdk/client-kms");
const { parseArgs } = require('util');
const { ApiClient } = require("./libs/api");
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");

const fs = require('fs')


const args = [
    { name: "awsCoreProfile", mandatory: true },
    { name: "envType", mandatory: true },
    { name: "requestId", mandatory: false },
    { name: "inputFile", mandatory: false },
    { name: "outputFile", mandatory: true },
    { name: "callAddressManager", mandatory: false },
    { name: "nrBasePath", mandatory: false },
    { name: "adrMBasePath", mandatory: false },
    { name: "apikeypdv", mandatory: false },
    { name: "apikeyselfcare", mandatory: false },
]
const values = {
  values: { awsCoreProfile, envType, requestId, inputFile, outputFile, callAddressManager, nrBasePath, adrMBasePath, apikeypdv, apikeyselfcare },
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
    inputFile: {
        type: "string",
        short: "i"
    },
    outputFile: {
        type: "string",
        short: "i"
    },
    callAddressManager: {
        type: "string",
        short: "i"
    },
    nrBasePath: {
        type: "string",
        short: "i"
    },
    adrMBasePath: {
        type: "string",
        short: "i"
    },
    apikeypdv: {
        type: "string",
        short: "i"
    },
    apikeyselfcare: {
        type: "string",
        short: "i"
    },
  },
});

args.forEach(k => {
    if (k.mandatory && !values.values[k.name]) {
      console.log("Parameter '" + k.name + "' is not defined")
      console.log("Usage: node index.js --awsCoreProfile <aws-core-profile> --envType <env-type> --requestId <request-id> || --inputFile")
      process.exit(1)
    }
    if(!nrBasePath){
        console.log('use default basePath NR');
        nrBasePath = 'http://localhost:8888';
    }
    if(!adrMBasePath){
        console.log('use default basePath NR');
        adrMBasePath = 'http://localhost:8887';
    }

    if(!callAddressManager || (callAddressManager+'').toUpperCase() != 'TRUE'){
        callAddressManager = false;
    }else{
        callAddressManager= true;
    }
  });

outputFile = outputFile+'_'+(new Date().toISOString()+'')+'.csv';
console.log("Using AWS Core profile: "+ awsCoreProfile)
console.log("Using Env Type: "+ envType)
console.log("Using Request ID: "+ requestId)
console.log("Using input file : "+ inputFile)
console.log("Using output file : "+ outputFile)



const urls = {
    uat: {
      pdv: 'https://api.uat.tokenizer.pdv.pagopa.it',
      selfcare: 'https://api.uat.selfcare.pagopa.it'
    },
    prod: {
      pdv: 'https://api.tokenizer.pdv.pagopa.it',
      selfcare: 'https://api.selfcare.pagopa.it'
    },
  }

const baseUrlSelfcare = envType == 'prod' ? urls.prod.selfcare : urls.uat.selfcare
const baseUrlPDV = envType == 'prod' ? urls.prod.pdv: urls.uat.pdv


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

let firstWrite = true;
const csvTop = 'requestId; address1; address2; equalityResult; error; normalizedAddress';

function initialiteRequestId(){
    let requestIds;
    if(inputFile){
        requestIds = fs.readFileSync(inputFile, { encoding: 'utf8', flag: 'r' }).split('\n')
    }else{
        console.log('Use requestId value');
        requestIds = new Array(requestId)
    }
    return requestIds;
}

async function run(){
    let requestIds = initialiteRequestId();
    for(i=0; i < requestIds.length; i++){

        let currentRequestId = requestIds[i];

        const keyArn = await getKeyArn()    
        console.log('kms key arn', keyArn)

        if(!keyArn){
            throw new Error("Missing key arn")
        }

        const paperReceiverAddress = await getReceiverPaperAddress(currentRequestId)
        console.log('original address data', paperReceiverAddress)

        const decodedAddressData = await getDecodedAddressData(paperReceiverAddress, keyArn)
        console.log('decoded address data', decodedAddressData)

        const paperRequestDelivery = await getPaperRequestDelivery(currentRequestId)
        console.log('paper request delivery', paperRequestDelivery)

        let cxId = paperRequestDelivery.fiscalCode;
        console.log('Fiscal Code: ', cxId)
    
        const awsClient = new AwsClientsWrapper(envType);
        /*
        const apiKeys = await awsClient._getSecretKey('pn-PersonalDataVault-Secrets')
        const secrets =  {
            apiKeyPF: apiKeys.TokenizerApiKeyForPF,
            apiKeyPG: apiKeys.SelfcareApiKeyForPG
        }
        */

        const secrets =  {
            apiKeyPF: apikeypdv,
            apiKeyPG: apikeyselfcare
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


        let nrResponse = await ApiClient.callNr(cxId,fiscalCode,nrBasePath)
        if(nrResponse && nrResponse.residentialAddresses){
            console.log("NR response: "+JSON.stringify(nrResponse.residentialAddresses));


        }
        

        let baseAddress = {
            cap: decodedAddressData['cap'],
            addressRow: decodedAddressData['address'],
            addressRow2: decodedAddressData['addressRow2'],
            city: decodedAddressData['city'],
            pr: decodedAddressData['pr'],
            country: decodedAddressData['country']
        }
        console.log('baseAddress: ',baseAddress);

        let jsonNrAddress = nrResponse ? nrResponse.residentialAddresses[0]: null;
        let targetAddress = jsonNrAddress ? {
            cap: jsonNrAddress['zip'],
            addressRow: jsonNrAddress['address'],
            addressRow2: jsonNrAddress['addressDetails'],
            city: jsonNrAddress['municipality'],
            city2: jsonNrAddress['municipalityDetails'],
            pr: jsonNrAddress['province'],
            country: jsonNrAddress['foreignState']
        } : null
        console.log('TargetAddress: ',targetAddress);
       
        let deduplicateAddress;
        if(targetAddress && callAddressManager){
            deduplicateAddress = await ApiClient.callAddressManager(adrMBasePath,currentRequestId,baseAddress,targetAddress);
            console.log('AddressManager call result: ',deduplicateAddress);
        }
       
        //csvTop = 'requestId; address1; address2; equalityResult; error; normalizedAddress';
        let address1 = baseAddress? JSON.stringify(baseAddress) : 'N/A';
        let address2 = targetAddress? JSON.stringify(targetAddress) : 'N/A';
        let equalityResult = deduplicateAddress ? deduplicateAddress['equalityResult'] : 'N/A';
        let error = deduplicateAddress ? deduplicateAddress['error'] : 'N/A';
        let normalizedAddress = deduplicateAddress ? JSON.stringify(deduplicateAddress['normalizedAddress']) : 'N/A';

        let result = currentRequestId+";"+address1+';'+address2+';'+equalityResult+';'+error+';'+normalizedAddress;
        console.log("RESULT: "+result);

        if(outputFile){
             if(firstWrite){
                console.log('Write first time');
                fs.writeFileSync(outputFile, csvTop + '\n', (err) => { if (err) { throw new Error(`Error appending to file: ${err}`); } });
                firstWrite = false;
             }

            fs.appendFileSync(outputFile, result + '\n', (err) => { if (err) { throw new Error(`Error appending to file: ${err}`); } });
        }
        
    }
    
    return;
    
}

    

run()
.then(() => {
    console.log('process finished')
})