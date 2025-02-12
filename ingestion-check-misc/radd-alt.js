const AWS = require('aws-sdk');

// Configure AWS with your credentials and region
// Configure AWS to use a specific profile
// const credentials = new AWS.SharedIniFileCredentials({ profile: 'uat_Full' });
const credentials = new AWS.SharedIniFileCredentials({ profile: 'prod_ROA' });

AWS.config.credentials = credentials;
AWS.config.update({ region: 'eu-south-1' });
// Initialize DynamoDB DocumentClient
const dynamodb = new AWS.DynamoDB.DocumentClient();
console.log("connected?");
// Replace 'YourTableName' with your actual table name
const tableName = 'pn-radd-transaction-alt';

async function countRaddTransactions(tableName, operationType, excludedRecipientIds) {
  console.log("try to scan the table");
  let params = {
    TableName: tableName,
    FilterExpression: 'operationType = :operationType', // Filter for operationType 'ACT'
    ExpressionAttributeValues: {
      ':operationType': operationType, // Value for operationType
    },
  };

  excludedRecipientIds.forEach((recipientId, index) => {
    params.FilterExpression += ` AND recipientId <> :excludedRecipientId${index}`;
    params.ExpressionAttributeValues[`:excludedRecipientId${index}`] = recipientId;
  });

  let groupedMetrics = {};

  try {
    let lastEvaluatedKey = null;

    do {
      const result = await dynamodb.scan(params).promise();

      result.Items.forEach((item) => {
        // Extract 'codice fiscale' from the transactionId
        const transactionIdParts = item.transactionId.split('#');
        const codiceFiscaleCAF = transactionIdParts[1]; // Get the 'codice fiscale'

        // Initialize group if not already present
        if (!groupedMetrics[codiceFiscaleCAF]) {
          groupedMetrics[codiceFiscaleCAF] = {
            completed: 0,
            aborted: 0,
            error: 0,
            draft: 0,
            accessedByDelegate: 0,
            uniqueRecipientIds: new Set(), // Use a Set to store unique recipientIds
            uniqueNotificationIUN: new Set(),
          };
        }

        // Count based on operation_status
        if (item.operation_status === 'COMPLETED') {
          groupedMetrics[codiceFiscaleCAF].completed += 1;
        } else if (item.operation_status === 'ABORTED') {
          groupedMetrics[codiceFiscaleCAF].aborted += 1;
        } else if (item.operation_status === 'ERROR') {
          groupedMetrics[codiceFiscaleCAF].error += 1;
        } else if (item.operation_status === 'DRAFT') {
          groupedMetrics[codiceFiscaleCAF].draft += 1;
        }

        if (item.delegateId) {
          groupedMetrics[codiceFiscaleCAF].accessedByDelegate +=1;
        }

        // Add recipientId to the Set (automatically handles duplicates)
        if (item.recipientId) {
          groupedMetrics[codiceFiscaleCAF].uniqueRecipientIds.add(item.recipientId);
        }
        if (item.iun) {
          groupedMetrics[codiceFiscaleCAF].uniqueNotificationIUN.add(item.iun);
        }
      });

      lastEvaluatedKey = result.LastEvaluatedKey; // Handle pagination
      params.ExclusiveStartKey = lastEvaluatedKey;

    } while (lastEvaluatedKey);


    // Output the results
    for (const [codiceFiscale, metrics] of Object.entries(groupedMetrics)) {
      console.log(`Codice Fiscale: ${codiceFiscale}`);
      console.log(`  Operazione: ${operationType}`)
      console.log(`  Completed Transactions: ${metrics.completed}`);
      console.log(`  Aborted Transactions: ${metrics.aborted}`);
      console.log(`  Error Transactions: ${metrics.error}`);
      console.log(`  Draft Transactions: ${metrics.draft}`);
      console.log(`  Unique Recipient IDs: ${metrics.uniqueRecipientIds.size}`);
      console.log(`  Accessed By delegate: ${metrics.accessedByDelegate}`)
      console.log(`  Unique IUN count: ${metrics.uniqueNotificationIUN.size}`)
    }

    return groupedMetrics;

  } catch (error) {
    console.error('Error scanning the table:', error);
    throw error;
  }
}

// esclude from query business simulations recipients
const excludedRecipientIds = ['PF-5024cd5b-4516-499c-97b6-0069bc882589', 'PF-afdfcac9-d954-44f9-9c6f-b37c13dde9ba', 'PG-9bd89873-1bfa-41b2-8956-3d8e68f4eb36', 'PF-d704d752-2b3d-4b6a-872c-e962440135b3'];
// Call the function with your table name
countRaddTransactions(tableName, 'ACT', excludedRecipientIds);
countRaddTransactions(tableName, 'AOR', excludedRecipientIds);
