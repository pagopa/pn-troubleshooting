const { SQSClient, SendMessageCommand, GetQueueUrlCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { QueryCommand, DynamoDBDocumentClient, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { v4 } = require('uuid');

const arguments = process.argv;
  
if(arguments.length<=4){
  console.error("Specify AWS profile")
  console.log("node redrive_paper_event.js <aws-core-profile> <aws-confinfo-profile> <request-id>")
  process.exit(1)
}

const awsCoreProfile = arguments[2]
const awsConfinfoProfile = arguments[3]
const requestId = arguments[4]
const tableAccountMapping = {
    'pn-EcRichieste': {
        account: 'confinfo',
        service: 'dynamoDB'
    },
    'pn-EcRichiesteMetadati': {
        account: 'confinfo',
        service: 'dynamoDB'
    },
    'pn-PaperRequestError': {
        account: 'core',
        service: 'dynamoDB'
    },
    'pn-paper_channel_requests-DLQ': {
        account: 'core',
        service: 'SQS'
    },
}

console.log("Using AWS Core profile: "+ awsCoreProfile)
console.log("Using AWS Confinfo profile: "+ awsConfinfoProfile)

//LOGIN PHASE
const coreCredentials = fromSSO({ profile: awsCoreProfile })();
const coreClient = new DynamoDBClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});

const confinfoCredentials = fromSSO({ profile: awsConfinfoProfile })();
const confinfoClient = new DynamoDBClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});
//DynamoDB Client
const coreDynamoClient = DynamoDBDocumentClient.from(coreClient);
const confinfoDynamoClient = DynamoDBDocumentClient.from(confinfoClient);
const coreSqsClient = new SQSClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});
const confinfoSqsClient = new SQSClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});

async function queryItemFromTable(tableName, keys){
    const client = getClientByService(tableName)
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
    const ret = await client.send(new QueryCommand(params));
    if(ret && ret.Items){
        return ret.Items
    }
    return []
}

async function putItemInTable(tableName, item){
    const client = getClientByService(tableName)
    const command = new PutCommand({
        TableName: tableName,
        Item: item
    });
    const res = await client.send(command);
    return res
}

async function deleteItemFromTable(tableName, keys){
    const client = getClientByService(tableName)
    const command = new DeleteCommand({
        TableName: tableName,
        Key: keys});

    const res = await client.send(command);
    return res
}

async function sendSQSMessage(sqsName, item){
    const client = getClientByService(sqsName)
    const getUrlCommand = new GetQueueUrlCommand({ // SendMessageRequest
        QueueName: sqsName, // required
      });
    const getUrlRes = await client.send(getUrlCommand);
    if(getUrlRes['$metadata'].httpStatusCode == 200) {
        const command = new SendMessageCommand({ // SendMessageRequest
            QueueUrl: getUrlRes.QueueUrl, // required
            MessageBody: JSON.stringify(item.Body), // required
            MessageAttributes: item.MessageAttributes 
          });
        const response = await client.send(command);
        return response;
    }
}

function getClientByService(key){
    const account = tableAccountMapping[key].account
    if(!account){
        throw new Error("Service not mapped " + key)
    }
    if(account==='core'){
        if (tableAccountMapping[key].service === "dynamoDB") {
            return coreDynamoClient
        }
        else if (tableAccountMapping[key].service === "SQS") {
            return coreSqsClient
        }
    } 
    if(account==='confinfo'){
        if (tableAccountMapping[key].service === "dynamoDB") {
            return confinfoDynamoClient
        }
        else if (tableAccountMapping[key].service === "SQS") {
            return confinfoSqsClient
        }
    }
}

async function recreateItemWithAppendKeyValue(tableName, append) {
    const items = await queryItemFromTable(tableName, {
        requestId: requestId
    })
    var item = items[0]
    item.requestId = item.requestId + "_" + append
    const resPut = await putItemInTable(tableName, item);
    if(resPut['$metadata'].httpStatusCode == 200 ) {
        console.log("PUT COMMAND OK!")
        const resDel = await deleteItemFromTable(tableName, {
            "requestId": requestId,
            "created": item.created
        });
        console.log(resDel)
        if(resDel['$metadata'].httpStatusCode == 200 ) {
            console.log("DELETE COMMAND OK!")
            console.log("UPDATE COMPLETE")
        } 
        else
            console.error("AN ERROR IN DELETE COMMAND OCCURRED")
    }
    else
        console.error("AN ERROR IN PUT COMMAND OCCURRED")
    return
    
}

async function redriveMessageToSqs(sqs){
    const valueV1 = createSqsMessagev1()
    const res1 = await sendSQSMessage(sqs, valueV1)
    /*const valueV2 = await createSqsMessagev2()
    const res2 = await sendSQSMessage(sqs, valueV2)
    */
    console.log("SEND MESSAGE COMPLETE")
}


function createSqsMessagev1(){
    let iun = requestId.split(".")[1].replace("IUN_", "")
    console.log(iun)
    const date = Date.now()
    const time = new Date(date).toISOString();
    const expiredTime = new Date(date + (1000*10)).toISOString();
    sqsMex = {
        Body: {
            "requestId": requestId,
            "iun": iun,
            "correlationId": null,
            "isAddressRetry": false,
            "attempt": 1,
        },
        MessageAttributes : {
            attempt: {
                DataType: "String",
                StringValue: "1"
            },
            createdAt: {
                DataType: "String",
                StringValue: time
            },
            eventId: {
                DataType: "String",
                StringValue: v4()
            },
            eventType: {
                DataType: "String",
                StringValue: "SAFE_STORAGE_ERROR"
            },
            expired: {
                DataType: "String",
                StringValue: expiredTime
            },
            publisher: {
                DataType: "String",
                StringValue: "paper-channel-prepare"
            }
        }
    }
    console.log(sqsMex)
    return sqsMex
}

async function createSqsMessagev2(){
    let i = 0;
    const client = getClientByService("pn-EcRichiesteMetadati")
    let temp = "pn-cons-000~" + requestId + ".PCRETRY_"
    var items;
    let hasNext = true;
    while(hasNext){
        items = await queryItemFromTable("pn-EcRichiesteMetadati", {
            requestId: temp + i
        })
        if(items.length == 1){
            i = i + 1
        }
        else {
            i = i - 1
            hasNext = false
        }
            
    }
    let currentRequestId = temp + i
    const date = Date.now()
    const expiredTime = new Date(date + (1000*10)).toISOString();
    sqsMex = {
        Body: {
            "requestId": currentRequestId,
        },
        MessageAttributes : {
            attempt: {
                DataType: "String",
                StringValue: "0"
            },
            eventType: {
                DataType: "String",
                StringValue: "MANUAL_RETRY_EXTERNAL_CHANNEL"
            },
            expired: {
                DataType: "String",
                StringValue: expiredTime
            },
        }
    }
    return sqsMex
}

recreateItemWithAppendKeyValue("pn-PaperRequestError", "TMP")
redriveMessageToSqs("pn-paper_channel_requests-DLQ")

