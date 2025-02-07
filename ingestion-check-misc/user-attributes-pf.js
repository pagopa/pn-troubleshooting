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

async function countPFWithRecapito(pkPrefix) {

    const params = {
        TableName: tableName,
        FilterExpression: 'begins_with(pk, :pkPrefix) AND created <= :endDate',
        ExpressionAttributeValues: {
            ':pkPrefix': pkPrefix,
            ':endDate': endDate
        },
    };

    try {
        let totalCountPf = new Set();
        let lastEvaluatedKey = null;

        do {
            const result = await dynamodb.scan(params).promise();
            result.Items.forEach((item) => {
                totalCountPf.add(item.pk);
            });

            lastEvaluatedKey = result.LastEvaluatedKey; // Check if there's more data to retrieve
            params.ExclusiveStartKey = lastEvaluatedKey; // Set start key to continue scan if needed

        } while (lastEvaluatedKey)
        return totalCountPf.size;
    } catch (err) {
        console.error(`Error scanning for ${skPrefix}:`, err);
        return 0;
    }
}



async function main() {
    // Define the sk_prefix for each type and channel
    const pfPrefix = 'AB#PF-';
    const pgPrefix = 'AB#PG-';
    const numCittadini = await countPFWithRecapito(pfPrefix);
    const numImprese = await countPFWithRecapito(pgPrefix);

    // // Print the results
    console.log("Data di esecuzione della query:", new Date().toISOString());
    console.log('############# Numero di utenti con almeno un recapito #################');
    console.log(`NUMERO PF: ${numCittadini}`);
    console.log(`NUMERO PG: ${numImprese}`);

}

// Execute the main function
main().catch(console.error);
