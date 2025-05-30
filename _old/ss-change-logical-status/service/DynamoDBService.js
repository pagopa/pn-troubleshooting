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
    }
    

    async updateItem(tableName, key, expressionAttributeNames, expressionAttributeValues, updateExpression) {
        const updateCommand = new UpdateCommand({
            TableName: tableName,
            Key: {
                documentKey: key
            },
            ConditionExpression: "attribute_exists(documentKey) AND documentKey = :documentKey",
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: {
                ...expressionAttributeValues,
                ":documentKey": key
            }
        });
        try {
            return await this.dynamoDbDocumentClient.send(updateCommand);
        }
        catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new Error('Record with given documentKey does not exist');
            } else {
                throw error;
            }
        }
    }

    async updateDocumentState(tableName, key, newDocumentState) {
        return await this.updateItem(tableName, key, { '#documentStateKey': 'documentState' }, { ':documentStateValue': newDocumentState }, "SET #documentStateKey = :documentStateValue")
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