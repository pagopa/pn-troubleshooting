const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const fs = require('fs')
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { ScanCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { parseArgs } = require('util');
const { KinesisClient, PutRecordsCommand } = require("@aws-sdk/client-kinesis");
const { S3Client, HeadObjectCommand } = require("@aws-sdk/client-s3");

function makePartitionKey(event){
    return 'str##'+event.detail.key
}

function getStreamNameFromArn(streamArn){
    return streamArn.split(':stream/')[1]
}

function _checkingParameters(args, values){
    const usage = "Usage: index.js --envName <env-name> --streamArn <stream-arn> --bucket <bucket>"
    //CHECKING PARAMETER
    args.forEach(el => {
      if(el.mandatory && !values.values[el.name]){
        console.log("Param " + el.name + " is not defined")
        console.log(usage)
        process.exit(1)
      }
    })
  }

  
const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "streamArn", mandatory: true, subcommand: [] },
    { name: "bucket", mandatory: true, subcommand: [] }
  ]
  
const values = {
        values: { envName, streamArn, bucket },
    } = parseArgs({
        options: {
            envName: {
                type: "string", short: "e", default: undefined
            },
            streamArn: {
                type: "string", short: "s", default: undefined
            },
            bucket: {
                type: "string", short: "b", default: undefined
            }
        }
    });  

_checkingParameters(args, values)

const awsConfinfoProfile = "sso_pn-confinfo-" + envName
const confinfoCredentials = fromSSO({ profile: awsConfinfoProfile })();
const kinesisClient = new KinesisClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});

const s3Client = new S3Client({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});

const confinfoDynamoDbClient = new DynamoDBClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});
const confinfoDDocClient = DynamoDBDocumentClient.from(confinfoDynamoDbClient);

async function getObjectMetadata(fileKey){
    const input = {
        "Bucket": bucket,
        "Key": fileKey
      };
      const command = new HeadObjectCommand(input);
      const response = await s3Client.send(command);

      return response;
}

const scanPage = async (lastEvaluatedKey) => {
    const input = {
        "TableName": "pn-SsDocumenti"
    };

    if(lastEvaluatedKey){
        input['ExclusiveStartKey'] = lastEvaluatedKey
    }
    const scanCommand = new ScanCommand(input)
    
    return confinfoDDocClient.send(scanCommand)
}

const tpl = fs.readFileSync('./event-tpl.json')
const jsonTpl = JSON.parse(tpl)

const publishEvents = async(results) => {
    const kinesisEvents = results.Items.filter((i) => {
        return [ 'PN_AAR', 
        'PN_LEGAL_FACTS', 
        'PN_DOWNTIME_LEGAL_FACTS', 
        'PN_EXTERNAL_LEGAL_FACTS', 
        'PN_LOGS_ARCHIVE_AUDIT5Y', 
        'PN_LOGS_ARCHIVE_AUDIT10Y'  ]
        .indexOf(i.documentType.tipoDocumento)>=0
    }).map((i) => {
        const obj = Object.assign({}, jsonTpl)
        obj.detail.key = i.documentKey
        obj.detail.documentType = i.documentType.tipoDocumento
        obj.detail.contentType = i.contentType
        obj.detail.checksum = i.checkSum
        obj.detail.client_short_code = i.clientShortCode
        obj.detail.is_mock_fill = true
        return obj
    })

    for(let i=0; i<kinesisEvents.length; i++){
        const s3Metadata = await getObjectMetadata(kinesisEvents[i].detail.key)
        console.log(s3Metadata)
        kinesisEvents[i].time = new Date(s3Metadata.LastModified).toISOString()
        console.log('time '+kinesisEvents[i].time)
    }

    console.log('kinesis events', kinesisEvents)

    const chunkSize = 500;
    for (let i = 0; i < kinesisEvents.length; i += chunkSize) {
        const chunk = kinesisEvents.slice(i, i + chunkSize);
        console.log('processing chunk '+(i+1))
        await putEventsIntoKinesis(chunk)
    }
}

async function putEventsIntoKinesis(events){
    
    const records = events.map((e) => {
        const base64data = Buffer.from(JSON.stringify(e))

        const r = {
            Data: base64data,
            PartitionKey: makePartitionKey(e)
        }

        return r
    })
    
    const streamName = getStreamNameFromArn(streamArn)
    const input = { // PutRecordInput
      Records: records,
      StreamARN: streamArn,
      StreamName: streamName
    };
    const command = new PutRecordsCommand(input);
    const response = await kinesisClient.send(command);
    return response
}

async function run(){
    let lastEvaluatedKey = null
    let hasMorePages = true
    while(hasMorePages) {
        const resultsPage = await scanPage(lastEvaluatedKey)

        await publishEvents(resultsPage)
        lastEvaluatedKey = resultsPage.LastEvaluatedKey
        hasMorePages = false
    }
}
run()