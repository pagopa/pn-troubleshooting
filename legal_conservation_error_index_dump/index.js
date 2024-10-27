// Import required AWS SDK v3 modules
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { fromSSO } = require('@aws-sdk/credential-provider-sso');

// Function to query DynamoDB using pagination
async function queryDynamoDB() {
  const PK_VALUE = "202409";
  const TABLE_NAME = "pn-legal-conservation-request-history";
  const INDEX_NAME = "sortBy-errorTimestamp";
  
  // Create a DynamoDB client using an SSO profile
  const dynamoClient = new DynamoDBClient({
    region: 'eu-south-1', // specify the AWS region where your table is located
    credentials: fromSSO({ profile: 'sso_pn-confinfo-prod-ro' }) // specify the SSO profile name
  });

  let lastEvaluatedKey = null;

  try {
    do {
      // Prepare the query parameters
      const params = {
        TableName: TABLE_NAME,
        IndexName: INDEX_NAME,
        KeyConditionExpression: 'errorResponseTimestampYearMonth = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: PK_VALUE }
        },
        ProjectionExpression: 'fileKey, errorCode',
        ExclusiveStartKey: lastEvaluatedKey, // for pagination
        Limit: 100 // adjust the page size as necessary
      };

      // Execute the query command
      const command = new QueryCommand(params);
      const response = await dynamoClient.send(command);

      // Print out the results for the current page
      response.Items.forEach(item => {
        console.log(JSON.stringify(item));
      });

      // Update the last evaluated key for pagination
      lastEvaluatedKey = response.LastEvaluatedKey;

    } while (lastEvaluatedKey); // Continue looping if there's more data

  } catch (error) {
    console.error('Error querying DynamoDB:', error);
  }
}

// Run the query
queryDynamoDB();
