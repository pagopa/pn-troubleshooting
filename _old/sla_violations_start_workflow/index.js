const { SQSClient, SendMessageCommand, GetQueueUrlCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { parseArgs } = require('util');
const fs = require('fs');

const args = ["awsCoreProfile", "file"]
const values = {
  values: { awsCoreProfile, file },
} = parseArgs({
  options: {
    awsCoreProfile: {
      type: "string",
    },
    file: {
      type: "string",
    },
  },
});

args.forEach(k => {
    if(!values.values[k]) {
      console.log("Parameter '" + k + "' is not defined")
      console.log("Usage: node index.js --awsCoreProfile <aws-profile-core> --file <file>")
      process.exit(1)
    }
  });

console.log("Using AWS Core profile: "+ awsCoreProfile)

//LOGIN PHASE
const coreCredentials = fromSSO({ profile: awsCoreProfile })();
const coreDynamoDbClient = new DynamoDBClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});

const coreSqsClient = new SQSClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});

async function getItemFromTable(tableName, keys){
    const params = {
        TableName: tableName,
        Key: keys    
    };
    const ret = await coreDynamoDbClient.send(new GetCommand(params));
    if(ret && ret.Item){
        return ret.Item
    }
    return null
}

async function getQueueUrlByName(queueName){
    const getUrlCommand = new GetQueueUrlCommand({ // SendMessageRequest
        QueueName: queueName, // required
      });
    const getUrlRes = await coreSqsClient.send(getUrlCommand);
    if(getUrlRes['$metadata'].httpStatusCode == 200) {
        return getUrlRes.QueueUrl
    } else {
        throw new Error("Queue url not found "+queueName)
    }
}
async function sendSQSMessage(item){
    const command = new SendMessageCommand(item);
    const response = await coreSqsClient.send(command);
    return response;
}

function mapMessage(item, queueUrl){
    const senderPaId = item.senderPaId;
    const iun = item.iun;

    const message = {
        QueueUrl: queueUrl,
        Id: iun + "_start",
        DelaySeconds: 0,
        MessageGroupId: 'DELIVERY',
        MessageDeduplicationId: iun + "_start",
        MessageAttributes: {
            "createdAt": {
                DataType: "String",
                StringValue: item.sentAt
            },
            "eventId": {
                DataType: "String",
                StringValue: iun + "_start"
            },
            "eventType": {
                DataType: "String",
                StringValue: "NEW_NOTIFICATION"
            },
            "iun": {
                DataType: "String",
                StringValue: iun
            },
            "publisher": {
                DataType: "String",
                StringValue: "DELIVERY"
            }
        },
        MessageBody: JSON.stringify({paId: senderPaId})
    };
    return message;
}

async function recreateSqsEvents(){
    const iunsFileContent = fs.readFileSync(file, 'utf8');
    const iunsFileContentAsJson = JSON.parse(iunsFileContent)

    const iuns = iunsFileContentAsJson.filter((item) => {
        return item.timeline.length===0
    }).map((item) => {
        return item.iun
    })

    console.log('iuns', iuns)
    const tableName = "pn-Notifications"
    const queueName = 'pn-delivery_push_inputs.fifo'
    const queueUrl = await getQueueUrlByName(queueName)

    for(let i=0; i<iuns.length; i++){
        const notificationEntity = await getItemFromTable(tableName, {iun: iuns[i]})
        if(notificationEntity){
            const message = mapMessage(notificationEntity, queueUrl)
            await sendSQSMessage(message)
            console.log('Sent message for notification '+iuns[i], message)
        } else {
            console.warn('Notification not found '+iuns[i])
        }
    }
}
recreateSqsEvents()


