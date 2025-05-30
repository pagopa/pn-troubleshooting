const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { QueryCommand, DeleteCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { GetQueueUrlCommand, SendMessageCommand, SQSClient } = require("@aws-sdk/client-sqs"); 

const { parseArgs } = require('util');
const fs = require('fs')

const args = [
    { name: "awsCoreProfile", mandatory: true },
    { name: "publish", mandatory: false },
]
const values = {
  values: { awsCoreProfile, publish },
} = parseArgs({
  options: {
    awsCoreProfile: {
      type: "string",
      short: "a"
    },
    publish: {
        type: "boolean",
        default: false,
        short: "p"
    }
  },
});

args.forEach(k => {
    if (k.mandatory && !values.values[k.name]) {
      console.log("Parameter '" + k.name + "' is not defined")
      console.log("Usage: node index.js --awsCoreProfile <aws-core-profile> [--publish]")
      process.exit(1)
    }
  });

  console.log("Using AWS Core profile: "+ awsCoreProfile)
  console.log("Using Publish message SQS : "+ publish)


const coreCredentials = fromSSO({ profile: awsCoreProfile })();
const coreDynamoDbClient = new DynamoDBClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});
const coreDDocClient = DynamoDBDocumentClient.from(coreDynamoDbClient);

const sqsClient = new SQSClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});

function getAllCLPRecords(){
    const data = fs.readFileSync('./20231027_listadeduplica_out.json')
    // separate data by new line
    const lines = data.toString().split('\n')
    return lines.map(l => {
        try {
            const p = JSON.parse(l)
            return p
        } catch(e){
            return {}
        }
    })
    .filter(r => r.risultatoDedu )
}

async function getProductTypeAndRequestIdByCorrelationId(correlationId){
    // get dynamo record from pn-PaperRequestDelivery index correlation-index
    // get Command from correlation-index of pn-PaperRequestDelivery table

    const queryCommand = new QueryCommand({
        TableName: 'pn-PaperRequestDelivery',
        IndexName: 'correlation-index',
        KeyConditionExpression: 'correlationId = :correlationId',
        ExpressionAttributeValues: {
            ':correlationId': correlationId
        }
    })

    const records = await coreDDocClient.send(queryCommand)
    
    // return first record
    if(!records.Items || records.Items.length == 0){
        return {}
    }
    // get productType and requestId from record
    const productType = records.Items[0].productType
    const requestId = records.Items[0].requestId
    return {productType, requestId}
}

const eventTpl = {
    "prepareEvent": {
        "productType": "",
        "requestId": "",
        "statusCode": "KO",
        "statusDateTime": "",
        "failureDetailCode": "D02",
        "statusDetail": "PC010",
        "receiverAddress": {
            fullname: '',
            nameRow2: '',
            address: '',
            addressRow2: '',
            cap: '',
            city: '',
            city2: '',
            pr: '',
            country: ''
        }
    },
    "sendEvent": null
}

function generateEventToPublish(productType, requestId, originalEvent){
    const tpl = Object.assign({}, eventTpl)
    tpl.prepareEvent.productType = productType
    tpl.prepareEvent.requestId = requestId
    tpl.prepareEvent.statusDateTime = new Date().toISOString()
    tpl.prepareEvent.receiverAddress = {
        fullname: '',
        nameRow2: originalEvent.slaveOut.sPresso,
        address: originalEvent.slaveOut.sViaCompletaSpedizione,
        addressRow2: originalEvent.slaveOut.sCivicoAltro,
        cap: originalEvent.slaveOut.sCap,
        city: originalEvent.slaveOut.sComuneSpedizione,
        city2: originalEvent.slaveOut.sFrazioneSpedizione,
        pr:  originalEvent.slaveOut.sSiglaProv,
        country:  originalEvent.slaveOut.sStatoSpedizione
    }
    return tpl
}

async function deletePaperRequestErrorByRequestId(requestId){
    const queryCommand = new QueryCommand({
        TableName: 'pn-PaperRequestError',
        KeyConditionExpression: 'requestId = :requestId',
        ExpressionAttributeValues: {
            ':requestId': requestId
        }
    })

    const records = await coreDDocClient.send(queryCommand)

    for(let i=0; i<records.Items.length; i++){
        const record = records.Items[i]
        console.log('deleting record', record)
        const deleteCommand = new DeleteCommand({
            TableName: 'pn-PaperRequestError',
            Key: {
                requestId: record.requestId,
                created: record.created
            }
        })
        return coreDDocClient.send(deleteCommand)
    }
}

async function getQueueUrlFromQueueName(queueName){
    const getQueueUrlCommand = new GetQueueUrlCommand({
        QueueName: queueName
    })
    const queueUrl = await sqsClient.send(getQueueUrlCommand)
    return queueUrl.QueueUrl
}

async function sendSqsMessage(messageBody, queueUrl){
    // prepare sqs message
    const sqsMessage = {
        MessageBody: JSON.stringify(messageBody),
        QueueUrl: queueUrl,
    }

    // add eventType attribute to SQS Message
    sqsMessage.MessageAttributes = {
        eventType: {
            DataType: 'String',
            StringValue: 'PREPARE_ANALOG_RESPONSE'
        },
        publisher: {
            DataType: 'String',
            StringValue: 'paper-channel-update'
        }
    }
    
    await sqsClient.send(new SendMessageCommand(sqsMessage))

    return messageBody
}

async function run(){
    const records = getAllCLPRecords()
    console.log("Total records: " + records.length)

    const queueUrl = await getQueueUrlFromQueueName('pn-external_channel_outputs') 
    console.log('Queue URL '+queueUrl)

    const recordsToPublish = []
    for(let i=0; i<records.length; i++){   
        const record = records[i]
        const correlationId = record.slaveOut.id
        console.log('correlationId: ' + correlationId)
        const { productType, requestId } = await getProductTypeAndRequestIdByCorrelationId(correlationId)

        const eventToPublish = generateEventToPublish(productType, requestId, record)
        recordsToPublish.push(eventToPublish)
    }

    if(publish){
        console.log('Publish to SQS', JSON.stringify(recordsToPublish))
        console.log('End publish')
        // publish to SQS
        for(let i=0; i<recordsToPublish.length; i++){  
            console.log('Send SQS Message', recordsToPublish[i])
            const messageBody = await sendSqsMessage(recordsToPublish[i], queueUrl)
            // delete from pn-PaperRequestError
            const requestId = messageBody.prepareEvent.requestId
            console.log('Delete Paper RequestError '+requestId)
            await deletePaperRequestErrorByRequestId(requestId)
        }
    } else {
        console.log('Events '+recordsToPublish.length)
        console.log('No SQS sendMessage', JSON.stringify(recordsToPublish))
        console.log('End NO publish')
    }


}

run()