const AWS = require('aws-sdk')


if(process.argv.length<4){
    console.log('Usage: node index.js <aws-profile> <client-id>')
    process.exit(1)
}

let credentials = null
const awsProfile = process.argv[2]
const clientId = process.argv[3]
const parameterName = '/pn-national-registries/infocamere-cert-next'

process.env.AWS_SDK_LOAD_CONFIG=1
if(awsProfile.indexOf('sso_')>=0){ // sso profile
  credentials = new AWS.SsoCredentials({profile:awsProfile});
  AWS.config.credentials = credentials;
}
AWS.config.update({region: 'eu-south-1'});
const kms = new AWS.KMS();
const ssm = new AWS.SSM();
const base64url = require("base64url");
const crypto = require('crypto');

async function getParameterValue(){
    const parameter = await ssm.getParameter({
        Name: parameterName, /* required */
    }).promise()

    const parameterValue = JSON.parse(parameter.Parameter.Value)
    return parameterValue
}

function getCertificate(base64EncodedCertificate){
    const buf = Buffer.from(base64EncodedCertificate, 'base64');
    const base64Decoded = buf.toString('utf-8')
    
    return base64Decoded
        .replace('-----BEGIN CERTIFICATE-----', '')
        .replace('-----END CERTIFICATE-----', '')
        .replace(/\n/g, '')
}

async function generateToken(){
    const parameterValue = await getParameterValue()
    const keyId = parameterValue.keyId; // leggere da parameter store , chiave keyId
    const x5c = getCertificate(parameterValue.cert)
    let token_components = getTokenComponent(x5c);
    let res = await sign(token_components, keyId)
    return res;
}

function getTokenComponent(x5c) {

    let header = {
        "use": "sig",
        "x5c": [
            x5c
        ],
        "typ": "JWT",
        "alg": "RS256"
    };
    
    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    
    const payload = {
        "aud": "https://icapiscl.infocamere.it/ic/ce/wspa/wspa/rest", // fisso
        "sub": clientId, // input
        "scope": "lr-pa", // fisso
        "iss": clientId, // input
        "exp": parseInt(exp.getTime()/1000), // now()+1 month
        "jti": crypto.randomUUID() // generate random UUID
    }

    return {
        header: base64url(JSON.stringify(header)),
        payload: base64url(JSON.stringify(payload)),
    };
}

function getSignature(message, keyId) {
    return kms.sign({
        Message: message,
        KeyId: keyId,
        SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
        MessageType: 'RAW'
    }).promise()
}

async function sign(tokenParts, keyId) {
    const message = Buffer.from(tokenParts.header + "." + tokenParts.payload);
    const res = await getSignature(message, keyId);
    tokenParts.signature = res.Signature.toString("base64")
                                        .replace(/\+/g, '-')
                                        .replace(/\//g, '_')
                                        .replace(/=/g, '');
    const token = tokenParts.header + "." + tokenParts.payload + "." + tokenParts.signature;
    return token;
}

generateToken()
.then(function(d){
    console.log(d)
})