const AWS = require('aws-sdk');
const fs = require('fs');

const arguments = process.argv ;
  
if(arguments.length<=3){
  console.error("Specify AWS profile and DynamoDB table as argument")
  console.log("node scan_dynamo.js <aws-profile> <dynamodb-table>")
  process.exit(1)
}

const awsProfile = arguments[2]
const table = arguments[3]

let dlqUrl = null;
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
  TableName: table,
  Limit: 100
  // FilterExpression: <condition>,
};

const scanTable = async () => {
    const scanResults = [];
    let items;
    do{
      items = await dynamoDB.scan(params).promise();
      items.Items.forEach((item) => console.log(JSON.stringify(AWS.DynamoDB.Converter.marshall(item))));
      params.ExclusiveStartKey = items.LastEvaluatedKey;
    } while(typeof items.LastEvaluatedKey !== "undefined");
    
    return scanResults
}

scanTable()
.then((rows) => {
    console.log('done')
})