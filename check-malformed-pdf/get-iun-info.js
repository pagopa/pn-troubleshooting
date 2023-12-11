const fs = require('fs')
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { QueryCommand, GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");



process.env.AWS_SDK_LOAD_CONFIG=1

const env = process.argv[2]
const inputFilePath = process.argv[3]

const coreProfile = 'sso_pn-core-'+env

const coreCredentials = fromSSO({ profile: coreProfile })();

const coreDynamoDbClient = new DynamoDBClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});
const coreDocClient = DynamoDBDocumentClient.from(coreDynamoDbClient);

async function queryItemFromTable(tableName, keys){
    const expressionAttributes = {}
    Object.entries(keys).forEach((k) => {
        expressionAttributes[':'+k[0]] = k[1]
    })

    const params = {
        TableName: tableName,
        KeyConditionExpression: Object.entries(keys).map((k) => {
            return k[0]+' = :'+k[0]
        }).join(', '),
        ExpressionAttributeValues: expressionAttributes
    };

    const ret = await coreDocClient.send(new QueryCommand(params));
    if(ret && ret.Items){
        return ret.Items
    }

    return []
}

async function getDynamoDbItem(tableName, key){
    const params = {
        TableName: tableName,
        Key: key
    };
    const ret = await coreDocClient.send(new GetCommand(params));
    if(ret && ret.Item){
        return ret.Item
    }
    return null
}

async function processSingleItem(item){
    const { iun } = item
    const tableName = 'pn-Notifications'
    const keys = {
        iun: iun
    }
    const notification = await getDynamoDbItem(tableName, keys)

    if(!notification){
        console.log('Item not found in DynamoDB', iun)
        return
    }

    const timelineElements = await queryItemFromTable('pn-Timelines', keys)

    const sortedTimelineElements = timelineElements.sort((a, b) => {
        return a.timestamp - b.timestamp
    })
    const obj = {
        notification: notification,
        lastTimelineElementId: sortedTimelineElements[sortedTimelineElements.length-1].timelineElementId,
        timelineElements: sortedTimelineElements
    }

    console.log(JSON.stringify(obj))
    return obj
}

async function main(){
    const items = fs.readFileSync(inputFilePath, 'utf8').split('\n').map((line) => {
        const [iun, key] = line.split(',')
        return {
            iun,
            key
        }
    })

    for(let i=0; i<items.length; i++){
        await processSingleItem(items[i])
    }
}


main().then(() => console.log('done')).catch(err => console.log(err))