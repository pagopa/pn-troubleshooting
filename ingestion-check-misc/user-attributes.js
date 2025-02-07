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
const endDate = '2025-01-14T23:59:46.921468518Z';

async function countItems(pkPrefix, skPrefix) {

    const params = {
        TableName: tableName,
        FilterExpression: 'begins_with(pk, :pkPrefix) AND contains(sk, :skPrefix) AND created <= :endDate',
        ExpressionAttributeValues: {
            ':pkPrefix': pkPrefix,
            ':skPrefix': skPrefix,
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

async function countAppIO(enabledPrefix) {
    const appIO = '#APPIO';
    const enabled = enabledPrefix;
    const pfPrefix = 'AB#PF-';
    const params = {
        TableName: tableName,
        FilterExpression: 'begins_with(pk, :pfPrefix) AND contains(sk, :appIO) AND addresshash = :enabled',
        ExpressionAttributeValues: {
            ':appIO': appIO,
            ':enabled': enabled,
            ':pfPrefix': pfPrefix
        },
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
    const pfPrefix = 'AB#PF-';
    const pgPrefix = 'AB#PG-';
    const courtesyEmailCount = await countItems(pfPrefix, '#EMAIL');
    const legalPecCount = await countItems(pfPrefix, '#PEC');
    const courtesySmsCount = await countItems(pfPrefix, '#SMS');
    const appIOcountEnabled = await countAppIO('ENABLED');
    const appIOcountDisabled = await countAppIO('DISABLED');

    const courtesyEmailCountPG = await countItems(pgPrefix, '#EMAIL');
    const legalPecCountPG = await countItems(pgPrefix, '#PEC');
    const courtesySmsCountPG = await countItems(pgPrefix, '#SMS');

    // // Print the results
    console.log("Data di esecuzione della query:", new Date().toISOString());
    console.log('############# RECAPITI PF #################');
    console.log(`NUMERO EMAIL PF: ${courtesyEmailCount}`);
    console.log(`NUMERO PEC PF: ${legalPecCount}`);
    console.log(`NUMERO SMS PF: ${courtesySmsCount}`);
    console.log(`NUMERO APP IO: ${appIOcountEnabled}`);
    console.log(`NUMERO APP IO: ${appIOcountDisabled}`);


    console.log('############ RECAPITI PG ##################');
    console.log(`NUMERO EMAIL PG: ${courtesyEmailCountPG}`);
    console.log(`NUMERO PEC PG: ${legalPecCountPG}`);
    console.log(`NUMERO SMS PG: ${courtesySmsCountPG}`);
}

// Execute the main function
main().catch(console.error);
