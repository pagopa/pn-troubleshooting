const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { BatchGetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");

const { parseArgs } = require('util');
const fs = require('fs')

const args = [
    { name: "awsCoreProfile", mandatory: true },
]

const values = {
  values: { awsCoreProfile },
} = parseArgs({
  options: {
    awsCoreProfile: {
      type: "string",
      short: "a"
    },
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


const coreCredentials = fromSSO({ profile: awsCoreProfile })();
const coreDynamoDbClient = new DynamoDBClient({
    credentials: coreCredentials,
    region: 'eu-south-1'
});
const coreDDocClient = DynamoDBDocumentClient.from(coreDynamoDbClient);

function getAllRecords(){
    const data = fs.readFileSync('dump.json', 'utf-8')

    const records = JSON.parse(data)

    return records
}

async function getEcRichiestMetadatiByRequestId(requestIds = []){
    // batch get pn-ecRichiesteMetadati

    const command = new BatchGetCommand({
        // Each key in this object is the name of a table. This example refers
        // to a Books table.
        RequestItems: {
          'pn-EcRichiesteMetadati': {
            // Each entry in Keys is an object that specifies a primary key.
            Keys: requestIds.map(id => {
                return {
                    requestId: id
                }
            }),
          },
        },
    });
    
    // send command
    const data = await coreDDocClient.send(command);
    return data.Responses['pn-EcRichiesteMetadati']
}

function findEventByNextStatus(inputEvent, dynamoRecord){
    const eventsList = dynamoRecord.eventsList || []

    const statusToFind = inputEvent.nextStatus

    const found = eventsList.find(e => {
        return e.digProgrStatus.status == statusToFind
    })

    return found
}

function isSameEvent(inputEvent, dynamoEvent){
    // input event
    const inputEventTimestamp = inputEvent.digitalProgressStatusDto.eventTimestamp
    const inputEventSystem = inputEvent.digitalProgressStatusDto.generatedMessage.system
    const inputEventId = inputEvent.digitalProgressStatusDto.generatedMessage.id

    // dynamo event
    const eventSystem = dynamoEvent.digProgrStatus.generatedMessage.system
    const eventId = dynamoEvent.digProgrStatus.generatedMessage.id
    const eventTimestamp = dynamoEvent.digProgrStatus.eventTimestamp

    const eventEpoch = new Date(eventTimestamp).getTime()
    const inputEventEpoch = new Date(inputEventTimestamp).getTime()

    return eventSystem == inputEventSystem
        && eventId == inputEventId
        && eventEpoch == inputEventEpoch
}

async function run(){
    const records = getAllRecords()
    console.log("Total records: " + records.length)

    // split records in batch of 10
    const batchRecords = []
    let batch = []
    for(let i=0; i<records.length; i++){
        batch.push(records[i])
        if(batch.length == 100){
            batchRecords.push(batch)
            batch = []
        }
    }

    /**
     * 
     query=".Item.eventsList.L[].M.digProgrStatus.M | .status.S == \"${nextStatus}\""
  found=$(echo ${response} | jq "${query}" | grep -n true)
  index=$(($(echo ${found} | cut -d ':' -f 1) - 1))
  found=$(echo ${found} | cut -d ':' -f 2)
  if [ "x${found}" == "xtrue" ] ; then
    query=".Item.eventsList.L[${index}].M.digProgrStatus.M"
    event=$(echo ${response} | jq "${query}")
    eventTimestamp=$(echo ${event} | jq -r ".eventTimestamp.S")
		eventSystem=$(echo ${event} | jq -r ".generatedMessage.M.system.S")
		eventId=$(echo ${event} | jq -r ".generatedMessage.M.id.S")

		if [ "x${eventSystem}" != "x${system}" ] ; then
      echo "[ERROR] ${requestKey} - event \"${nextStatus}\" duplicated but attributes 'system' mismatch - Warning"
      continue
		fi
		if [ "x${eventId}" != "x${id}" ] ; then
      echo "[ERROR] ${requestKey} - event \"${nextStatus}\" duplicated but attributes 'id' mismatch - Warning"
      continue
		fi
		eventEpoch=$(gdate -d ${eventTimestamp} +%s)
		epoch=$(gdate -d ${timestamp} +%s)
		if [ ${eventEpoch} -ne ${epoch} ] ; then
      echo "[ERROR] ${requestKey} - event \"${nextStatus}\" duplicated but attributes 'eventTimestamp' mismatch - Warning"
      continue
		fi

    echo "[INFO ] ${requestKey} - event \"${nextStatus}\" duplicated - Ok"
  else
    echo "[ERROR] ${requestKey} - event \"${nextStatus}\" MISSING - KO"
  fi
     */
    const eventsToSend = {}
    const eventsToAnalyze = {}

    for(let i=0; i<batchRecords.length; i++){  
        const batch = batchRecords[i]
        const ids = batch.map(r => {
            return r.xpagopaExtchCxId+'~'+r.requestIdx
        })

        const uniqueIds = [...new Set(ids)]
        const batchDynamoRecords = await getEcRichiestMetadatiByRequestId(uniqueIds)

        const dynamoIds = batchDynamoRecords.map(r => {
            return r.requestId
        })


        // diff between dynamoIds and uniqueIds
        const diff = uniqueIds.filter(x => !dynamoIds.includes(x));
        if(diff.length>0){
            console.log('[ERROR] Missing records in dynamo: ' + diff.join(', '))
        }

        for(let i=0; i<batch.length; i++){
            const dynamoRecord = batchDynamoRecords.find(r => {
                return r.requestId == batch[i].xpagopaExtchCxId+'~'+batch[i].requestIdx
            })

            const inputEvent = batch[i]

            const sameStatusEvent = findEventByNextStatus(inputEvent, dynamoRecord)
            if(!sameStatusEvent){
                console.log('[ERROR] Missing event in dynamo for request: ' + inputEvent.xpagopaExtchCxId+'~'+inputEvent.requestIdx + ' - ' + inputEvent.nextStatus)
                eventsToSend[inputEvent.xpagopaExtchCxId+'~'+inputEvent.requestIdx+'-'+inputEvent.nextStatus] = inputEvent
                continue
            }

            const sameEvent = isSameEvent(inputEvent, sameStatusEvent)
            if(!sameEvent){
                console.log('[WARNING] Different same status event in dynamo for request: ' + inputEvent.xpagopaExtchCxId+'~'+inputEvent.requestIdx + ' - ' + inputEvent.nextStatus)
                eventsToAnalyze[inputEvent.xpagopaExtchCxId+'~'+inputEvent.requestIdx+'-'+inputEvent.nextStatus] = inputEvent
                continue
            }

            console.log('[OK] Duplicate event in dynamo for request: ' + inputEvent.xpagopaExtchCxId+'~'+inputEvent.requestIdx + ' - ' + inputEvent.nextStatus)
            
        }
    }

    fs.writeFileSync('./events-to-republish.json', JSON.stringify(eventsToSend, null, 2), 'utf-8')
    fs.writeFileSync('./events-to-analayze.json', JSON.stringify(eventsToAnalyze, null, 2), 'utf-8')
}

run()