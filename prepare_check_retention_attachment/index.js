const AwsClientsWrapper = require("../pn-common/libs/AwsClientWrapper")
const { open } = require('node:fs/promises')
const { v4: uuidv4 } = require('uuid')
const { parseArgs } = require('node:util')
const { openSync, closeSync, mkdirSync, appendFileSync } = require('node:fs')
const { join } = require('node:path')

// ------------------------------------------------

const args = [
    { name: "region", mandatory: false },
    { name: "env", mandatory: true },
    { name: "fileName", mandatory: true },
    { name: "startIun", mandatory: false }
];

const parsedArgs = { values: { region, env, fileName, startIun } } = parseArgs(
    {
        options: {
            region: { type: "string", short: "r", default: "eu-south-1" },
            env: { type: "string", short: "e" },
            fileName: { type: "string", short: "f" },
            startIun: { type: "string", short: "a" }
        }
    })

// ----------------------------------------------

async function main() {

    function _checkingParameters(args, parsedArgs) {

        const usage = `Usage: 
        node index.js \\
            [--region <region>] \\
            --env <env> \\
            --fileName <output file from 'retrieve_attachments_from_iun'> \\
            [--startIun <iun value>]\n`

        // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
        args.forEach(el => {
            if (el.mandatory && !parsedArgs.values[el.name]) {
                console.log("\nParam \"" + el.name + "\" is not defined or empty.")
                console.log(usage)
                process.exit(1)
            }
        });
    }

    function createOutputFile() {
        mkdirSync(join(__dirname, "results"), { recursive: true });
        const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        const resultPath = join(__dirname, "results", 'sqsMsg_' + dateIsoString + '.json');
        return resultPath;
    }

    async function _getSsBuckets() {

        const bucketList = await awsClientConfinfo._getBucketList()
        const outputObj = {}
        for (const item of bucketList.Buckets) {
            if (item.Name.includes("pn-safestorage")) {
                item.Name.includes("staging") ? outputObj.stagingBucket = item.Name : outputObj.mainBucket = item.Name
            }
        }
        return outputObj
    }

    async function _removeAllS3DeleteMarker(bucket, fkey) {

        let toReturn = false // true if there is at least one delete marker deletion
        const fkObj = { fk: fkey }
        const resultVersions = await awsClientConfinfo._listObjectVersions(bucket, fkey);

        const { Versions } = resultVersions
        if(!Versions){
            return toReturn
        }

        const { DeleteMarkers } = resultVersions
        fkObj.hasDeleteMarker = DeleteMarkers ? true : false

        if (DeleteMarkers) {
            let removed = 0
            for (const item of DeleteMarkers) {
                const { $metadata: { httpStatusCode } } = await awsClientConfinfo._deleteObject(
                    bucket, fkey, item.VersionId)
                removed = httpStatusCode.toString().match(/2[0-9]{2}/) ? removed + 1 : removed
            }
            fkObj.DeleteMarkersRemoved = removed
            toReturn = true
        }
        outputObj.attachments.push(fkObj)
        return toReturn
    }

    async function _setDocumentStateAttached(fkey) {

        const tableName = "pn-SsDocumenti"
        const keys = { documentKey: fkey }
        const values = {
            documentState: {
                codeAttr: '#documentState',
                codeValue: ':newdocumentState',
                value: 'attached' // 'deleted'
            }
        }
        await awsClientConfinfo._updateItem(tableName, keys, values, 'SET')
        const lastElem = outputObj.attachments.length - 1
        outputObj.attachments[lastElem].documentStateAttached = true
    }

    async function _getItemFromPnFutureAction(iunValue) {
        const tableName = "pn-FutureAction";
        let lastEvaluatedKey = null;
        let items = [];
        do {
            const results = await awsClientCore._queryRequestByIndex(tableName, 'iun-index', 'iun', iunValue, lastEvaluatedKey);
            if (results.Items && results.Items.length > 0) {
                items.push(...results.Items);
            }
            lastEvaluatedKey = results.LastEvaluatedKey;
        } while (lastEvaluatedKey);
        return items;
    }

    // try/catch with exit code 1; no return value
    async function _setLogicalDeletedInPnFutureAction(timeSlotvalue, actionIdValue) {

        const tableName = "pn-FutureAction"
        const keys = {
            timeSlot: timeSlotvalue,
            actionId: actionIdValue
        }
        const values = {
            logicalDeleted: {
                codeAttr: '#logicalDeleted',
                codeValue: ':newlogicalDeleted',
                value: true
            },
            type: {
                codeAttr: '#type',
                // codeValue: ':codeValue',
                // value: <valore per update>,
                condCodeValue: ':condCodeValue',
                condValue: 'CHECK_ATTACHMENT_RETENTION'
            }
        }
        try {
            const { $metadata: { httpStatusCode } } = await awsClientCore._updateItem(
                tableName, keys, values, 'SET', '#type = :condCodeValue'
            )
            outputObj.LogicalDeletedTrue = httpStatusCode.toString().match(/2[0-9]{2}/) ? true : false
        }
        catch (e) {
            switch (e.name) {
                case 'ConditionalCheckFailedException':
                    outputObj.info = "'type' attribute not equal to '" + values.type.condValue + "'. Skipped"
                    break
                default:
                    console.log(e)
                    process.exit(2)
            }
        }
    }

    // eventId.StringValue = uuidv4()
    function _printMsgIntoFile(iunV) {

        const nowSec = Math.floor(Date.now() / 1000) // ok
        const yearInSec = (60 * 60 * 24 * 365) // il 2028 è bisestile -> un giorno in meno nel risultato
        const notBeforeV = new Date().toISOString().replace(/Z$/, '000000Z'); // 2025-04-05T08:29:17.005269680Z
        const timeSlotV = notBeforeV.replace(/:\d{2}\.\d+Z$/, '')
        const actionIdV = "check_attachment_retention_iun_" + iunV + "_scheduling-date_" + notBeforeV

        const sqsMsg = {
            Body: JSON.stringify({
                iun: iunV,
                notBefore: notBeforeV, // 2025-04-05T08:29:17.005269680Z
                ttl: nowSec + (yearInSec * 3), // occhio agli anni bisestili!
                type: "CHECK_ATTACHMENT_RETENTION",
                actionId: actionIdV,
                timeslot: timeSlotV // 2025-04-05T08:29
            }),
            MessageAttributes: {
                createdAt: {
                    DataType: "String",
                    StringValue: new Date().toISOString()
                },
                eventId: {
                    DataType: "String",
                    StringValue: uuidv4()
                },
                eventType: {
                    DataType: "String",
                    StringValue: "ACTION_GENERIC"
                },
                iun: {
                    DataType: "String",
                    StringValue: iunV
                },
                publisher: {
                    DataType: "String",
                    StringValue: "deliveryPush"
                }
            }
        }

        appendFileSync(sqsMsgFileHandler, JSON.stringify(sqsMsg) + "\n")
    }

    // -------------------------------------------

    _checkingParameters(args, parsedArgs)

    console.log('\n -> Login with AWS "confinfo" account')
    const awsClientConfinfo = new AwsClientsWrapper('confinfo', env)

    console.log('\n -> Login with AWS "core" account')
    const awsClientCore = new AwsClientsWrapper('core', env)

    awsClientConfinfo._initS3()
    awsClientConfinfo._initDynamoDB()
    awsClientCore._initDynamoDB()

    const inputFile = await open(fileName)

    const sqsMsgFile = createOutputFile()
    sqsMsgFileHandler = openSync(sqsMsgFile, 'a') // Se il file non esiste verrà creato

    const ssBucketsList = await _getSsBuckets()
    const bucket = ssBucketsList.mainBucket

    let keepSkip = 0;
    for await (const row of inputFile.readLines()) {

        const parsedRow = JSON.parse(row)
        const { attachments } = parsedRow
        const { iun } = parsedRow

        // Skippa le righe del csv fino a quando non incontra quella con row.actionId === actionId
        if (startIun !== undefined & iun !== startIun & keepSkip == 0) {
            continue;
        }
        else {
            keepSkip = 1;
        };

        // Output su console. L'esecuzione delle funzioni nel main aggiungono
        // nuovi attribbuti.
        outputObj = {
            iun: iun,
            attachments: []
        }

        // Una notifica può avere più attachments -> più fk
        for (fk of attachments) {

            const delMarkerRemoved = await _removeAllS3DeleteMarker(bucket, fk)

            if (delMarkerRemoved) {
                
                await _setDocumentStateAttached(fk)

                const futureActions = await _getItemFromPnFutureAction(iun)

                if (futureActions.length !== 0) {
                    for (const item of futureActions) {

                        const pk = item.timeSlot.S // 2025-06-10T21:06
                        const sk = item.actionId.S // check_attachment_retention_iun_KNDA-NPAG-VANA-202502-J-1_scheduling-date_2025-06-10T21:06:01.182068834Z

                        // only if 'type = "CHECK_ATTACHMENT_RETENTION"'
                        await _setLogicalDeletedInPnFutureAction(pk, sk)
                    }
                }
                _printMsgIntoFile(iun)
            }
        }

        if(!outputObj.attachments.length){
            outputObj.mgs = "No attachments available"
        }
        
        console.log(JSON.stringify(outputObj))
    }

    closeSync(sqsMsgFileHandler);
    await inputFile?.close();
}

main()
