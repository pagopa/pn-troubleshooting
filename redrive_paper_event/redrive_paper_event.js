const { SQSClient, SendMessageCommand, GetQueueUrlCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { QueryCommand, DynamoDBDocumentClient, PutCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");

const args = ["awsCoreProfile", "awsConfinfoProfile", "requestId"]
const values = {
  values: { awsCoreProfile, awsConfinfoProfile, requestId },
} = parseArgs({
  options: {
    awsCoreProfile: {
      type: "string",
    },
    awsConfinfoProfile: {
      type: "string",
    },
    requestId: {
      type: "string",
      short: "r"
    },
  },
});

args.forEach(k => {
    if(!values.values[k]) {
      console.log("Parameter '" + k + "' is not defined")
      console.log("Usage: node redrive_paper_events.js --awsCoreProfile <aws-profile-core> --awsConfinfoProfile <aws-profile-confinfo> --requestId <request-id>")
      process.exit(1)
    }
  });

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

async function recreateItemWithAppendKeyValue() {
    var tableName = "pn-PaperRequestError"
    const items = await queryItemFromTable(tableName, {
        requestId: requestId
    })
    var item = items[0]
    item.requestId = item.requestId + "_TMP"
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

async function redriveMessageToSqs(){
    const value = await createSqsMessage()
    const res = await sendSQSMessage("pn-paper_channel_requests-DLQ", value)
    console.log(res)
        if(resDel['$metadata'].httpStatusCode == 200 ) {
            await recreateItemWithAppendKeyValue()
            console.log("UPDATE COMPLETE")
        } 
        console.log("PROCESS COMPLETE")
}

async function createSqsMessage(){
    let i = 0;
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
            hasNext = false
        }
            
    }
    const date = Date.now()
    const expiredTime = new Date(date + (1000*10)).toISOString();
    sqsMex = {
        Body: {
            "requestId": requestId,
            "newPcRetry": i+"" // string required
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

redriveMessageToSqs()


