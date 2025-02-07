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
const tableName = 'pn-Mandate';
const startDate = '2024-11-27T08:35:14.569800167Z';
const endDate = '2024-12-30T23:08:48.144538900Z';

// Parametri per la Scan con FilterExpression
async function countMandate() {
    const params = {
        TableName: tableName,
        FilterExpression: '(#i_state = :state10 OR #i_state = :state20) AND #t_created BETWEEN :start AND :end',
        ExpressionAttributeNames: {
            '#i_state': 'i_state',
            '#t_created': 't_created'
        },
        ExpressionAttributeValues: {
            ':state10': 10,
            ':state20': 20,
            ':start': startDate,
            ':end': endDate
        },
    };

    let state20 = 0;
    let state10 = 0;
    let lastEvaluatedKey = null;
    do {
        const result = await dynamodb.scan(params).promise();
        
        result.Items.forEach((item) => {
            if (item.i_state == 10) state10 += 1;
            if (item.i_state == 20) state20 += 1;
        });
       
        lastEvaluatedKey = result.LastEvaluatedKey;
        params.ExclusiveStartKey = lastEvaluatedKey;
        
    } while (lastEvaluatedKey)

    console.log("Deleghe in stato 20: ", state20);
    console.log("Deleghe in stato 10: ", state10);
}

countMandate();







