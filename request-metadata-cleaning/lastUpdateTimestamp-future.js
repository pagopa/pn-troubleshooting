const { DynamoDBClient, DescribeTableCommand} = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { StandardRetryStrategy } = require("@smithy/middleware-retry");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { parseArgs } = require('util');
const fs = require('fs');
const readline = require("readline");
const cliProgress = require("cli-progress");
const progressBar = new cliProgress.SingleBar({
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    noTTYOutput: true
});
const REGION = 'eu-south-1';
const MISSING_TIMESTAMP_FILENAME = "missing_timestamp.csv";
const FAILURES_FILENAME = "failures.csv";
const TEST_FILENAME = "test-updated.csv";
const DRYRUN_FILENAME = "dryrun-updated.csv";
const DEFAULT_FILENAME = "updated.csv";



console.log(`Starting process at ${new Date().toISOString()}`);

const args = [
    { name: "awsProfile", mandatory: false },
    { name: "exclusiveStartKey", mandatory: false },
    { name: "scanLimit", mandatory: false },
    { name: "test", mandatory: false },
    { name: "dryrun", mandatory: false },
    { name: "requestIdsPath", mandatory: false }
]

const values = {
    values: { awsProfile, scanLimit, exclusiveStartKey, test, dryrun, requestIdsPath },
} = parseArgs({
    options: {
        awsProfile: {
            type: "string",
        },
        scanLimit: {
            type: "string",
        },
        exclusiveStartKey: {
            type: "string",
        },
        test: {
            type: "boolean"
        },
        dryrun: {
            type: "boolean"
        },
        requestIdsPath: {
            type: "string",
        }
    },
});


var confinfoCredentials;
if (awsProfile != null) { confinfoCredentials = fromSSO({ profile: awsProfile })(); }


const customRetryDecider = (err) => {
    console.log("Retrying for exception : " + err);
    return true;
};
// Retry strategy per i client AWS
const MAXIMUM_ATTEMPTS = 3;
const DELAY_RATIO = 3000;
const retryStrategy = new StandardRetryStrategy(
    () => Promise.resolve(MAXIMUM_ATTEMPTS),
    {
        delayDecider: (_delayBase, attempts) => {
            return DELAY_RATIO * attempts;
        },
        retryDecider: customRetryDecider,
    },
);
retryStrategy.mode = 'STANDARD';

const dynamoDbClient = new DynamoDBClient({
    credentials: confinfoCredentials,
    region: REGION,
    retryStrategy: retryStrategy
});
const dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient);
const tableName = "pn-EcRichiesteMetadati";

var itemFailures = 0;
var itemUpdates = 0;
var totalScannedRecords = 0;

if (test)
    scanLimit = 1;

async function switchUpdateMethod() {
    if (requestIdsPath != null) {
        await recordsCleaningFromFile(requestIdsPath);
    } else {
        await recordsCleaning();
    }
}

async function updateRecord(record) {
    try {
        var requestId = record.requestId;
        const currentVersion = record.version;
        var lastUpdateTimestamp = new Date().toISOString();

        var input = {
            TableName: tableName,
            "Key": {
                "requestId": requestId
            },
            ExpressionAttributeNames: {
                "#lctKey": "lastUpdateTimestamp",
                '#version': 'version'
            },
            ExpressionAttributeValues: {
                ":lctValue": lastUpdateTimestamp,
                ':expectedVersion': currentVersion,
                ':newVersion': currentVersion + 1,
            },
            ConditionExpression: "#version = :expectedVersion",
            UpdateExpression: "SET #lctKey = :lctValue, #version = :newVersion"
        };

        if (!dryrun) {
            const command = new UpdateCommand(input);
            await dynamoDbDocumentClient.send(command);
        } else {
            fs.appendFileSync(DRYRUN_FILENAME, requestId.toString() + "\r\n");
        }

        fs.appendFileSync(getFileName(), requestId.toString() + "\r\n");

    } catch (error) {
        console.warn(`\nError while updating record "${requestId}" : ${error}`);
        itemFailures++;
        fs.appendFileSync(FAILURES_FILENAME, requestId.toString() + "," + error + "\r\n");
        return;
    }
    itemUpdates++;
    return;
}

async function recordsCleaningFromFile(requestIdsPath) {
    let requestIdsList = await getFileFromPath(requestIdsPath);

    const totalRecords = requestIdsList.length;
    var workedRecords = 0;
    progressBar.start(totalRecords, 0);

    for(const requestId of requestIdsList) {
        progressBar.update(++workedRecords);
        try{
            const record = await getRecord(requestId);
            await processRecord(record);
        } catch (error) {
            console.log("Error while getting record from table with requestId: " + requestId + ": " + error);
            itemFailures++;
            fs.appendFileSync(FAILURES_FILENAME, requestId + "," + error + "\r\n");
        }
    }
}

async function getFileFromPath(requestIdsPath) {
    return new Promise((resolve, reject) => {
        try {
            const requestIdsList = [];
            const rl = readline.createInterface({
                input: fs.createReadStream(requestIdsPath),
                crlfDelay: Infinity
            });

            rl.on('line', (line) => {
                requestIdsList.push(line.trim());
            });

            rl.on('close', () => {
                resolve(requestIdsList);
            });
        } catch (error) {
            reject(new Error("Error while reading file at path " + requestIdsPath + ": " + error));
        }
    });
}

async function getRecord(requestId) {
    const getCommand = new GetCommand({
        TableName: tableName,
        Key: {
            requestId: requestId
        },
        ProjectionExpression: "requestId, lastUpdateTimestamp, eventsList, version",
        ConsistentRead: true
    })
    response = await dynamoDbDocumentClient.send(getCommand);
    if (response.Item == null) {
        throw new Error("Request with request id " + requestId + " does not exist.");
    }
    return response.Item;
}

async function getTotalRecords() {
    var response = await dynamoDbClient.send(new DescribeTableCommand({ TableName: tableName }));
    return response.Table.ItemCount;
}

async function recordsCleaning() {
    const totalRecords = await getTotalRecords();
    progressBar.start(totalRecords, 0);
    var hasRecords = true;
    var input = {
        TableName: tableName,
        ProjectionExpression: "requestId, eventsList, version, lastUpdateTimestamp",
        Limit: scanLimit,
        ConsistentRead: true
    };
    while (hasRecords) {

        if (exclusiveStartKey != null) {
            input.ExclusiveStartKey = { "requestId": exclusiveStartKey };
        }

        try {
            const data = await getRecords(input);
            totalScannedRecords += data.ScannedCount;
            progressBar.update(totalScannedRecords);
            if (data.LastEvaluatedKey == null || (test && itemUpdates >= 10)) {
                hasRecords = false;
            }
            else {
                exclusiveStartKey = data.LastEvaluatedKey.requestId;
            }
            for (const record of data.Items) {
                await processRecord(record);
            }
        }
        catch (error) {
            console.log(`Error while scanning table : ${error}`);
            console.log("Last evaluated key : " + exclusiveStartKey);
            hasRecords = false;
            throw (error);
        }
    }
}

async function processRecord(record){
    if(!record.hasOwnProperty('lastUpdateTimestamp') || record.lastUpdateTimestamp == null){
        fs.appendFileSync(MISSING_TIMESTAMP_FILENAME, record.requestId + "\r\n");
    }
    if (isTimestampInTheFuture(record.lastUpdateTimestamp)){
        await updateRecord(record);
    }

}

function getFileName() {
    if(dryrun)return DRYRUN_FILENAME;
    if(test)return TEST_FILENAME;
    return DEFAULT_FILENAME;
}

async function getRecords(input) {
    const command = new ScanCommand(input);
    return dynamoDbDocumentClient.send(command);
}

function logFinalReport() {
    console.log(`Ending process at ${new Date(Date.now()).toISOString()}`)
    console.log(`Scanned items: ${totalScannedRecords}, Updated items: ${itemUpdates}. Last evaluated key : ${exclusiveStartKey}. Failures : ${itemFailures}.`);
    console.log("Check "+ FAILURES_FILENAME  +" file for individual failures.")
}

function isTimestampInTheFuture(timestamp) {
    return new Date(timestamp) > new Date();
}

switchUpdateMethod()
    .then(
        function (data) {
            console.log("Successful operation.");
            logFinalReport();
            process.exit();
            return;
        },
        function (error) {
            console.error(`* FATAL * Error in process : ${error}`);
            logFinalReport();
            process.exit();
        });


//Handling of signals coming from the process.

function handleProcessSignal(signal) {
    console.log(`Received ${signal} signal. Ending script execution.`);
    logFinalReport();
    process.exit();
}

progressBar.stop();
process.on('SIGINT', handleProcessSignal);
process.on('SIGTERM', handleProcessSignal);
process.on('SIGHUP', handleProcessSignal);