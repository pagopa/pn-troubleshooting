const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { fromSSO } = require("@aws-sdk/credential-provider-sso");

class DynamoDBService {
    constructor(awsProfile, region) {
        var confinfoCredentials;
        if (awsProfile != null) { confinfoCredentials = fromSSO({ profile: awsProfile })(); }
        this.dynamoDbClient = new DynamoDBClient({
            region: region,
            credentials: confinfoCredentials
        });
        this.dynamoDbDocumentClient = DynamoDBDocumentClient.from(this.dynamoDbClient);
    }

    async getItem(tableName, key) {
        const getCommand = new GetCommand({
            TableName: tableName,
            Key: {
                documentKey: key
            },
        })
        const response = await this.dynamoDbDocumentClient.send(getCommand);
        if (response.Item == null) {
            throw new Error("Item with key " + key + " does not exist.");
        }
        return response.Item;

        /* Response example:
        {
            version: 1,
            clientShortCode: 'pn-delivery',
            documentState: 'BOOKED',
            documentType: {
                tipoDocumento: 'PN_NOTIFICATION_ATTACHMENTS',
                transformations: [],
                checksum: 'SHA256',
                initialStatus: null,
                statuses: { PRELOADED: [Object], ATTACHED: [Object] },
                informationClassification: 'C',
                timeStamped: 'NONE'
            },
            contentType: 'application/zip',
            documentKey: 'PN_NOTIFICATION_ATTACHMENTS-73f0fcd1fda4476ea87ff3a35aa7462e.zip'
        }
        */
    }

    async updateItem(tableName, key, expressionAttributeNames, expressionAttributeValues, updateExpression) {
        const updateCommand = new UpdateCommand({
            TableName: tableName,
            Key: {
                documentKey: key
            },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        });
        return await this.dynamoDbDocumentClient.send(updateCommand);
    }

    async putItem(tableName, item) {
        const putCommand = new PutCommand({
            TableName: tableName,
            Item: item
        })
        return await this.dynamoDbDocumentClient.send(putCommand);
    }

}

module.exports = DynamoDBService;