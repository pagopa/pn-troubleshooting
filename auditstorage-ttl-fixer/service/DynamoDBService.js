import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
//const { fromSSO } = require("@aws-sdk/credential-provider-sso");
//const { fromIni } = require('@aws-sdk/credential-providers');
const { fromNodeProviderChain } = require("@aws-sdk/credential-providers");

export class DynamoDBService {

    constructor(awsProfile, region, localstackEndpoint) {
        var confinfoCredentials;
        console.log("######### AWS_PROFILE: " , process.env.AWS_PROFILE);
        if (awsProfile != null && localstackEndpoint == undefined) {
            confinfoCredentials = fromNodeProviderChain({ clientConfig: {}, });
                    //fromIni({ profile: awsProfile })();
                    //fromSSO({ profile: awsProfile })();
            this.dynamoDbClient = new DynamoDBClient({
                region: region,
                credentials: confinfoCredentials
            });
        }
        if(localstackEndpoint != undefined){
            this.dynamoDbClient = new DynamoDBClient({
                region: region,
                endpoint: "http://localhost:4566",
                credentials: {
                    accessKeyId: "test",
                    secretAccessKey: "test",
                },
            });
        }
        this.dynamoDbDocumentClient = DynamoDBDocumentClient.from(this.dynamoDbClient);
    }

    async getItem(dynamoTable, key) {
        const getCommand = new GetCommand({
            TableName: dynamoTable,
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
/*
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
*/
    async updateItem(dynamoTable, key, expirationValue) {
        const updateCommand = new UpdateCommand({
            TableName: dynamoTable,
            Key: key,
            UpdateExpression: "SET #expiration = :expiration",
            ExpressionAttributeNames: {
              "#expiration": "expiration", // Mappa il placeholder '#expiration' al nome dell'attributo reale 'expiration'
            },
            ExpressionAttributeValues: {
              ":expiration": expirationValue, // Mappa il placeholder ':expiration' al valore che vuoi impostare
            },
            ReturnValues: "ALL_NEW",
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

    async scanItemsWithMissingExpiration(dynamoTable) {
        let ExclusiveStartKey;
        let lastEvaluatedKey;
        let allItems = [];

        try{
            //console.log("scanItemsWithMissingExpiration sulla tabella: ", dynamoTable);
            do{
                const scanCommand = new ScanCommand({
                    TableName: dynamoTable,
                    ExclusiveStartKey,
                    // Filtra gli elementi dove l'attributo 'expiration' NON esiste.
                    FilterExpression: "attribute_not_exists(#exp)", // Usa un ExpressionAttributeName per il nome dell'attributo
                    ExpressionAttributeNames: {
                      "#exp": "expiration", // Mappa il segnaposto #exp al nome dell'attributo 'expiration'
                    },
                })

                //Scanning for items where 'expiration' does NOT exist on table
                const response = await this.dynamoDbDocumentClient.send(scanCommand);
                allItems = allItems.concat(response.Items || []);
                lastEvaluatedKey = response.LastEvaluatedKey;

                // Aggiorna il parametro ExclusiveStartKey per la prossima iterazione (paginazione)
                ExclusiveStartKey = lastEvaluatedKey;

            } while (ExclusiveStartKey); // Continua finché ci sono più pagine

            //console.log("Numero totale di elementi trovati:", allItems.length);
        } catch (err) {
            console.error("Errore durante la Scan:", JSON.stringify(err, null, 2));
            console.error("Messaggio: ", err.message);
        }
        return allItems;
    }

}

//module.exports = DynamoDBService;
