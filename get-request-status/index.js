const { DynamoDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { parseArgs } = require('util');
const fs = require('fs');
const lineReader = require('line-reader');

const args = [
    { name: "awsProfile", mandatory: false },
    { name: "filePath", mandatory: true }
]

const values = {
    values: { filePath, awsProfile },
} = parseArgs({
    options: {
        filePath: { type: "string" },
        awsProfile: { type: "string" }
    },
});

var confinfoCredentials;
if (awsProfile != null) { confinfoCredentials = fromSSO({ profile: awsProfile })(); }

const dynamoDbClient = new DynamoDBClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});
const dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient);
const tableName = "pn-EcRichiesteMetadati";

lineReader.eachLine(filePath, function (line, last) {
    const getCommand = new GetCommand({
        Key: { "requestId": line },
        TableName: tableName
    })
    dynamoDbDocumentClient.send(getCommand).then(
        function (data) {
            if (data.Item == null) {
                throw new Error(`Record has not been found.`)
            }
            fs.appendFileSync("statuses.csv", line + "," + data.Item.statusRequest + "\r\n");
        })
        .catch(function (error) {
            console.warn("Exception while getting record from DynamoDb : " + error);
            fs.appendFileSync("failures.csv", line + "," + error + "\r\n");
        });
});


