const AWS = require('aws-sdk');
const fs = require('fs');
const { parseArgs } = require('util');

const args = ["awsProfile"]
const values = {
  values: { awsProfile },
} = parseArgs({
  options: {
    awsProfile: {
      type: "string",
      short: "a"
    },
  },
});

args.forEach(k => {
  if(!values.values[k]) {
    console.log("Parameter '" + k + "' is not defined")
    console.log("Usage: node scan_dynamo.js --awsProfile <aws-profile>")
    process.exit(1)
  }
});

const tableName = 'pn-DocumentCreationRequest'

console.log("Using profile: "+ awsProfile)

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
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Definisci i parametri di scan aggiungendo un filtro se desiderato https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/dynamodb-example-query-scan.html
const params = {
  TableName: tableName,
  FilterExpression: "begins_with(#t, :t) AND #s = :s",
  ExpressionAttributeNames: { 
    "#t": "key",
    "#s": "documentType"
  },
  ExpressionAttributeValues: { 
    ":s": "DIGITAL_DELIVERY",
    ":t": "safestorage://PN_LEGAL_FACTS-" 
  },
};

function appendJsonListToFile(fileName, jsonList) {
  fs.appendFileSync(fileName, jsonList.map(JSON.stringify).join("\n"));
  fs.appendFileSync(fileName, "\n");
}

const filename = tableName+'_'+new Date().toISOString()+'.json'

fs.writeFileSync(filename, '');
const scanTable = async () => {
    let items;
    do{
      items = await dynamoDB.scan(params).promise();
      appendJsonListToFile(filename, items.Items.map(AWS.DynamoDB.Converter.marshall))
      params.ExclusiveStartKey = items.LastEvaluatedKey;
    } while(typeof items.LastEvaluatedKey !== "undefined");
}

scanTable()
.then((results) => {
  console.log('done')
})