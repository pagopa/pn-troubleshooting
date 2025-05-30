const AWS = require('aws-sdk');
const fs = require('fs');

const args = ["awsProfile", "arnStream"]
const values = {
  values: { awsProfile, arnStream },
} = parseArgs({
  options: {
    awsProfile: {
      type: "string",
      short: "a"
    },
    arnStream: {
      type: "string",
      short: "s"
    }
  },
});

args.forEach(k => {
    if(!values.values[k]) {
      console.log("Parameter '" + k + "' is not defined")
      console.log("Usage: node put_dlq_event_to_kinesis.js --awsProfile <aws-profile> --arnStream <kinesis-stream-arn>")
      process.exit(1)
    }
  });

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