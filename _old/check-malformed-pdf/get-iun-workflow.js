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

function findLastIndexByPredicate(arr, predicate){
    for(let i=arr.length-1; i>=0; i--){
        if(predicate(arr[i])){
            return i
        }
    }
    return -1
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
        // timestamp is a iso string
        return new Date(a.timestamp) - new Date(b.timestamp)
    })

    const numRecipients = notification.recipients.length
    for(let i=0; i<numRecipients; i++){
        const recIndex = i
        const indexOfDigitalSuccessOrFailure = sortedTimelineElements.findIndex((e) => {
            return e.timelineElementId.indexOf('RECINDEX_'+recIndex)>0 && e.timelineElementId.indexOf('DIGITAL_DELIVERY_CREATION_REQUEST')===0 
        })

        const lastIndexOfDigitalFeedback = findLastIndexByPredicate(sortedTimelineElements, (e) => {
            return e.timelineElementId.indexOf('RECINDEX_'+recIndex)>0 && e.timelineElementId.indexOf('SEND_DIGITAL_FEEDBACK')===0
        })

        if(lastIndexOfDigitalFeedback>indexOfDigitalSuccessOrFailure){
            console.log('Found digital feedback after digital success/failure', iun, recIndex, indexOfDigitalSuccessOrFailure, 
            lastIndexOfDigitalFeedback)
        } else {
            console.log('Found digital feedback before digital success/failure', iun, recIndex, indexOfDigitalSuccessOrFailure, 
            lastIndexOfDigitalFeedback)
        }
    
    }
    
    const obj = {
        notification: notification,
        lastTimelineElementId: sortedTimelineElements[sortedTimelineElements.length-1].timelineElementId,
        timelineElements: sortedTimelineElements
    }
    // console.log(JSON.stringify(obj))
    
    // process.exit(0)

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

    const objects = []
    for(let i=0; i<items.length; i++){
        const obj = await processSingleItem(items[i])
        objects.push(obj)
    }

    fs.writeFileSync('workflow-iun-full-data.json', JSON.stringify(objects))
}


main().then(() => console.log('done')).catch(err => console.log(err))