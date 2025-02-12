const AWS = require('aws-sdk');

// Configure AWS with your credentials and region
// Configure AWS to use a specific profile
// const credentials = new AWS.SharedIniFileCredentials({ profile: 'uat_Full' });
const credentials = new AWS.SharedIniFileCredentials({ profile: 'prod_ROA' });

AWS.config.credentials = credentials;
AWS.config.update({ region: 'eu-south-1' });
// Initialize DynamoDB DocumentClient
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Replace 'YourTableName' with your actual table name
const tableName = 'pn-UserAttributes';
const startDate = '2023-06-14T09:58:14.003247363Z';
const endDate = '2025-02-11T00:00:00.000000000Z';

async function countItems(pkPrefix, skPrefix) {

    const params = {
        TableName: tableName,
        FilterExpression: 'begins_with(pk, :pkPrefix) AND contains(sk, :skPrefix) AND lastModified >= :startDate AND lastModified <= :endDate ',
        ExpressionAttributeValues: {
            ':pkPrefix': pkPrefix,
            ':skPrefix': skPrefix,
            ':startDate': startDate,
            ':endDate': endDate
        },
        Select: 'COUNT',
    };

    try {
        let totalCount = 0;
        let lastEvaluatedKey = null;

        do {
            const result = await dynamodb.scan(params).promise();
            totalCount += result.Count; // Add the count of items returned by this scan

            lastEvaluatedKey = result.LastEvaluatedKey; // Check if there's more data to retrieve
            params.ExclusiveStartKey = lastEvaluatedKey; // Set start key to continue scan if needed

        } while (lastEvaluatedKey)
        return totalCount;
    } catch (err) {
        console.error(`Error scanning for ${skPrefix}:`, err);
        return 0;
    }
}

async function main() {
    // Define the sk_prefix for each type and channel
    const dataPrivacyCount = await countItems('CO#', 'DATAPRIVACY#');
    const tosCount = await countItems('CO#', 'TOS#');
    console.log("Data di esecuzione della query:", new Date().toISOString());
    console.log("Count per dataPrivacy: ", dataPrivacyCount);
    console.log("Count per tos: ", tosCount);
}

// Execute the main function
main().catch(console.error);
