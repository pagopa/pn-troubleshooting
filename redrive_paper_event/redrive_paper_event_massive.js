const { SQSClient, SendMessageCommand, GetQueueUrlCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { QueryCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { parseArgs } = require('util');
const fs = require('fs');

const args = ["file"]
const values = {
  values: { file},
} = parseArgs({
  options: {
    file: {
      type: "string",
    },
  },
});

args.forEach(k => {
    if(!values.values[k]) {
      console.log("Parameter '" + k + "' is not defined")
      console.log("Usage: node redrive_paper_events.js --file <file>")
      process.exit(1)
    }
  });

const tableAccountMapping = {
    'pn-Timelines': {
        account: 'core',
        service: 'dynamoDB'
    },
    'pn-PaperRequestError': {
        account: 'core',
        service: 'dynamoDB'
    },
    'pn-paper_channel_requests': {
        account: 'core',
        service: 'SQS'
    },
}

//LOGIN PHASE
const coreClient = new DynamoDBClient({
    region: 'eu-south-1'
});

//DynamoDB Client
const coreDynamoClient = DynamoDBDocumentClient.from(coreClient);
const coreSqsClient = new SQSClient({
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

async function sendSQSMessage(queueUrl, item, delaySeconds){
    const command = new SendMessageCommand({ // SendMessageRequest
        QueueUrl: queueUrl, // required
        MessageBody: JSON.stringify(item.Body), // required
        MessageAttributes: item.MessageAttributes,
        DelaySeconds: delaySeconds
    });
    const response = await coreSqsClient.send(command);
    return response;
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
    }  else {
        throw new Error("Account not mapped " + account)
    }
}

async function checkIfCanceled(requestId){
    const iun = requestId.split('IUN_')[1].split('.')[0]
    const items = await queryItemFromTable("pn-Timelines", {
        iun: iun
    })

    const canceledIun = items.find((item) => {
        return item.timelineElementId.indexOf("NOTIFICATION_CANCELLED")>=0
    })

    return canceledIun!=null
}

function appendJSONToFile(file, json){
    fs.appendFileSync(file, JSON.stringify(json)+'\n');
}
// PREPARE_ANALOG_DOMICILE.IUN_EXEU-XZKY-DPKU-202310-K-1.RECINDEX_0.ATTEMPT_0.PCRETRY_2
function getExpectedPcRetry(requestId){
    const parts = requestId.split('.')
    const pcRetry = parts[parts.length-1]
    if(pcRetry.indexOf('PCRETRY_')!=0){
        return null;
    }
    return pcRetry.split('_')[1]
}

function getRequestIdWithoutPcRetry(requestId){
    const parts = requestId.split('.')
    parts.pop()
    return parts.join('.')
}

async function redriveMessageToSqs(queueUrl, requestId, delaySeconds){

    const expectedPcRetry = getExpectedPcRetry(requestId)
    if(expectedPcRetry){
        requestId = getRequestIdWithoutPcRetry(requestId)
    }

    console.log('PCRetry '+expectedPcRetry+' for requestId '+requestId)

    // async check is canceled
    const isCanceled = await checkIfCanceled(requestId)
    if(isCanceled){
        // append to file
        const canceledFile = 'canceled.json'
        appendJSONToFile(canceledFile, {
            requestId: requestId,
            status: "CANCELED"
        })
        return false
    }

    const value = await createSqsMessage(requestId, expectedPcRetry)

    await sendSQSMessage(queueUrl, value, delaySeconds)
    const okFile = 'ok.json'
    appendJSONToFile(okFile, {
        requestId: requestId,
        status: "OK"
    })
    return true
}

async function createSqsMessage(requestId, nextPcRetry){
    const date = Date.now()
    const expiredTime = new Date(date + (1000*10)).toISOString();
    sqsMex = {
        Body: {
            "requestId": requestId,
            "newPcRetry": nextPcRetry+"" // string required
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

async function run(){
    const getUrlCommand = new GetQueueUrlCommand({ // SendMessageRequest
        QueueName: 'pn-paper_channel_requests', // required
    });
    const getUrlRes = await coreSqsClient.send(getUrlCommand);

    const fileContent = fs.readFileSync(file, 'utf8');
    const allLines = fileContent.split('\n').filter((l) => {  
        return l !== '';
    }).map((l) => {
        return l.trim().replace('"', '').replace('"', '');
    });

    const lines = allLines;
    let delaySeconds = 0
    for(let i=0; i<lines.length; i++){
        if(delaySeconds>900){
            throw new Error("Delay seconds is too high ", delaySeconds)
        }
        const ret = await redriveMessageToSqs(getUrlRes.QueueUrl, lines[i], delaySeconds)
        if(ret){
            console.log('redrive of line '+i+' with delay '+delaySeconds+' seconds')
            //if(wait) await utils.sleep(wait)
            // sleep
            await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
            console.log('skipped redrive of line '+i+' with delay '+delaySeconds+' seconds')
        }
        //if(i%20==0){
        //    delaySeconds++
        //}
    }
}

run()
.then(() => {
    console.log('DONE')
})
.catch((err) => {
    console.log(err)
})