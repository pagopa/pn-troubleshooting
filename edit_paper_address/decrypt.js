/**
 * - decodifica address
 * - modifica address
 * - ricodifica address
 * - modifica hash
*/

const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const prompt = require('prompt-sync')({sigint: true});
const { CloudFormationClient, DescribeStacksCommand } = require("@aws-sdk/client-cloudformation");
const { KMSClient, DecryptCommand } = require("@aws-sdk/client-kms");

const arguments = process.argv;
  
if(arguments.length<=4){
  console.error("Specify AWS profile")
  console.log("node index.js <aws-core-profile> <env> <encrypted-string>")
  process.exit(1)
}

const awsCoreProfile = arguments[2]
const envType = arguments[3]
const encryptedString = arguments[4]

console.log("Using AWS Core profile: "+ awsCoreProfile)
console.log("Using Env Type: "+ envType)
console.log("Using encryptedString: "+ encryptedString)

const coreCredentials = fromSSO({ profile: awsCoreProfile })();

const cloudformationClient = new CloudFormationClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});

const kmsClient = new KMSClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});


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


async function run(){
    const keyArn = await getKeyArn()    
    console.log('kms key arn', keyArn)

    if(!keyArn){
        throw new Error("Missing key arn")
    }

    const decodedAddressData = await getDecryptedValue(encryptedString, keyArn)
    console.log('decoded address data', decodedAddressData)

}

run()
.then((d) => {
    console.log('data', d)
})