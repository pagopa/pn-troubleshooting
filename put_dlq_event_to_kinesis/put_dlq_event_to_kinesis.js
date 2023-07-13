const AWS = require('aws-sdk');
const fs = require('fs');
/*var credentials = new AWS.SharedIniFileCredentials({profile: 'default'});
AWS.config.credentials = credentials;
AWS.config.update({region: 'us-east-1', endpoint: 'http://localhost:4566'});*/

const arguments = process.argv ;
  
if(arguments.length<=3){
  console.error("Specify AWS profile and kinesis stream name as argument")
  process.exit(1)
}

const awsProfile = arguments[2]
const arnStream = arguments[3]

console.log("Using profile "+ awsProfile)

console.log("ARN Stream " + arnStream)

let credentials = null

process.env.AWS_SDK_LOAD_CONFIG=1
if(awsProfile.indexOf('sso_')>=0){ // sso profile
  credentials = new AWS.SsoCredentials({profile:awsProfile});
  AWS.config.credentials = credentials;
} else { // IAM profile
  credentials = new AWS.SharedIniFileCredentials({profile: awsProfile});
  AWS.config.credentials = credentials;
}
AWS.config.update({region: 'eu-south-1'});

const kinesis = new AWS.Kinesis();
const fileContent = fs.readFileSync('event.json');
const jsonObject = JSON.parse(fileContent);

let base64data = Buffer.from(JSON.stringify(jsonObject))

var params = {
    Data: base64data,
    PartitionKey: jsonObject.id,
    StreamARN: arnStream
  };

kinesis.putRecord(params, (err, data) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('Event has been put into the Data Stream successfully:', data);
    }
  });