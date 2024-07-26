const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const fs = require('fs');
const process = require('node:process');
const { DynamoDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { StandardRetryStrategy } = require("@smithy/middleware-retry");
const { parseArgs } = require('util');
const cliProgress = require('cli-progress');

const progressBar = new cliProgress.SingleBar({
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
  noTTYOutput: true
});

console.log(`Starting process at ${new Date(Date.now()).toISOString()}`);

const args = [
  { name: "awsProfile", mandatory: false },
  { name: "scanLimit", mandatory: false },
  { name: "test", mandatory: false },
  { name: "dryrun", mandatory: false },
  { name: "updateInsertTimestamp", mandatory: false },
  { name: "updateEventOrder", mandatory: false },
];

const { values } = parseArgs({
  options: {
    awsProfile: { type: "string" },
    scanLimit: { type: "string" },
    test: { type: "boolean" },
    dryrun: { type: "boolean" },
    updateInsertTimestamp: { type: "boolean" },
    updateEventOrder: { type: "boolean" },
  },
});

const { awsProfile, scanLimit, test, dryrun, updateInsertTimestamp, updateEventOrder } = values;
let scanLimitParsed = parseInt(scanLimit) || null;
if (test) { scanLimitParsed = 10; }

var confinfoCredentials;
if (awsProfile != null) { confinfoCredentials = fromSSO({ profile: awsProfile })(); }

const customRetryDecider = (err) => {
  console.log("Retrying for exception: " + err);
  return true;
};

const MAXIMUM_ATTEMPTS = 3;
const DELAY_RATIO = 3000;

const retryStrategy = new StandardRetryStrategy(
  () => Promise.resolve(MAXIMUM_ATTEMPTS),
  {
    delayDecider: (_delayBase, attempts) => DELAY_RATIO * attempts,
    retryDecider: customRetryDecider,
  },
);
retryStrategy.mode = 'STANDARD';

const dynamoDbClient = new DynamoDBClient({
  credentials: confinfoCredentials,
  region: 'eu-south-1',
  retryStrategy: retryStrategy
});
const dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient);
const tableName = "pn-EcRichiesteMetadati";
const outputFilePath1 = 'output_requestId-missing-insertTimestamp.txt';
const outputFilePath2 = 'output_requestId-insertTimestamp_disorder.txt';

const fileStream1 = createFileStream(outputFilePath1);
const fileStream2 = createFileStream(outputFilePath2);

function createFileStream(filePath) {
  const fileStream = fs.createWriteStream(filePath, { flags: 'a' });
  fileStream.on('error', (err) => {
    console.error(`Error writing to ${filePath}: ${err}`);
  });
  return fileStream;
}

let totalItems = 0;
let itemUpdates = 0;
let itemFailures = 0;
let scannedCount = 0;

async function getTotalRecords() {
    var response = await dynamoDbClient.send(new DescribeTableCommand({ TableName: tableName }));
    return response.Table.ItemCount;
  }

async function scanTable(params, processItem) {
  let lastEvaluatedKey = null;
  let isScanning = true;

  try {
    totalItems = await getTotalRecords();
    progressBar.start(totalItems, 0);
  } catch (err) {
    console.error('\nError counting items in table:', err);
    return;
  }

  while (isScanning) {
    try {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }

      const data = await dynamoDbDocumentClient.send(new ScanCommand(params));
      const newItems = data.Items || [];

      for (const item of newItems) {
        await processItem(item);
        scannedCount++;
        progressBar.update(scannedCount);
      }

      lastEvaluatedKey = data.LastEvaluatedKey;
      if (!lastEvaluatedKey || (scanLimitParsed && scannedCount >= scanLimitParsed)) {
        isScanning = false;
        console.log('\nScan complete or limit reached.');
      }
    } catch (err) {
      console.error('\nError scanning table:', err);
      isScanning = false;
    }
  }

  progressBar.stop();
}

// Check se le date sono in ordine cronologico
function isInChronologicalOrder(dates) {
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] < dates[i - 1]) {
      return false;
    }
  }
  return true;
}

// Scan and process items from the table
async function scanAndProcessItems() {
  const params = {
    TableName: tableName,
    ProjectionExpression: "requestId, eventsList",
    FilterExpression: "attribute_exists(eventsList) AND attribute_exists(eventsList[0].paperProgrStatus) AND NOT attribute_type(eventsList[0].paperProgrStatus, :nullType) "+
                        "OR attribute_exists(eventsList[0].digProgrStatus) AND NOT attribute_type(eventsList[0].digProgrStatus, :nullType)",
    ExpressionAttributeValues: { ":nullType": "NULL" },
    Limit: scanLimitParsed,
  };

  const processedRequestIds = new Set();

  const processItem = async item => {
    const requestId = item.requestId;
    const eventsList = item.eventsList || [];
    let statusDateTimes = [];
    let missingInsertTimestamp = false;

    eventsList.forEach(event => {
      if (event.paperProgrStatus && typeof event.paperProgrStatus === 'object') {
        const status = event.paperProgrStatus;
        if (status && status.statusDateTime) {
          const date = new Date(status.statusDateTime);
          statusDateTimes.push(date);
        }
      }

      if (!event.insertTimestamp) {
        missingInsertTimestamp = true;
      }
    });

    if (processedRequestIds.has(requestId)) {
      return;
    }

    if (!isInChronologicalOrder(statusDateTimes)) {
      const outputLine = `${requestId}\n`;
      fileStream2.write(outputLine);

      if (updateEventOrder) {
        await updateRecordEventListOrdered(requestId, sortEventsByInsertTimestamp(eventsList));
      }
    }

    if (missingInsertTimestamp) {
      const outputLine = `${requestId}\n`;
      fileStream1.write(outputLine);

      if (updateInsertTimestamp) {
        const maxInsertTimestamp = getMaxInsertTimestamp(eventsList);
        const newInsertTimestamp = new Date(maxInsertTimestamp.getTime() + 1).toISOString();
        await updateRecordInsertTimestamp(requestId, newInsertTimestamp, eventsList);
        await updateRecordEventListOrdered(requestId, sortEventsByInsertTimestamp(eventsList));
      }
    }

    processedRequestIds.add(requestId);
  };

  await scanTable(params, processItem);
}

// Get max insertTimestamp degli eventi con anno 1970
function getMaxInsertTimestamp(eventsList) {
  let maxTimestamp = new Date(0); // Inizializzazione con epoch time
  eventsList.forEach(event => {
    if (event.insertTimestamp) {
      const timestamp = new Date(event.insertTimestamp);
      if (timestamp.getFullYear() === 1970 && timestamp > maxTimestamp) {
        maxTimestamp = timestamp;
      }
    }
  });
  return maxTimestamp;
}

// Ordinamento eventi
function sortEventsByInsertTimestamp(eventsList) {
  return eventsList.sort((a, b) => {
    const aTime = a.insertTimestamp ? new Date(a.insertTimestamp).getTime() : 0;
    const bTime = b.insertTimestamp ? new Date(b.insertTimestamp).getTime() : 0;
    return aTime - bTime;
  });
}

// Update di insertTimestamp
async function updateRecordInsertTimestamp(requestId, insertTimestamp, eventsList) {
  try {
    const maxInsertTimestamp1970 = getMaxInsertTimestamp(eventsList);
    const newInsertTimestamp = maxInsertTimestamp1970
      ? new Date(maxInsertTimestamp1970.getTime() + 1).toISOString()
      : new Date().toISOString();

    const updatedEventsList = eventsList.map(event => {
      if (!event.insertTimestamp) {
        event.insertTimestamp = newInsertTimestamp;
      }
      return event;
    });

    const updateParams = {
      TableName: tableName,
      Key: { requestId },
      UpdateExpression: 'SET insertTimestamp = :insertTimestamp, eventsList = :eventsList',
      ExpressionAttributeValues: {
        ':insertTimestamp': newInsertTimestamp,
        ':eventsList': updatedEventsList
      },
    };

    if (dryrun) {
      console.log(`Dry run: Update record ${requestId} with insertTimestamp ${newInsertTimestamp}`);
    } else {
      await dynamoDbDocumentClient.send(new UpdateCommand(updateParams));
      itemUpdates++;
    }
  } catch (err) {
    console.error(`Failed to update record ${requestId}: ${err}`);
    itemFailures++;
  }
}

// Update degli eventi ordinati
async function updateRecordEventListOrdered(requestId, sortedEventsList) {
  try {
    const updateParams = {
      TableName: tableName,
      Key: { requestId },
      UpdateExpression: "SET eventsList = :sortedEventsList",
      ExpressionAttributeValues: { ":sortedEventsList": sortedEventsList },
      ReturnValues: "UPDATED_NEW"
    };

    if (dryrun) {
      console.log(`Dry run: Update record ${requestId} with ordered events list`);
    } else {
      await dynamoDbDocumentClient.send(new UpdateCommand(updateParams));
      itemUpdates++;
    }
  } catch (err) {
    console.error(`Failed to update event list for record ${requestId}: ${err}`);
    itemFailures++;
  }
}

async function run() {
  try {
    await scanAndProcessItems();
    console.log('Output files created.');
  } catch (error) {
    console.error(`Errore nel processo: ${error}`);
  } finally {
    closeFileStreams();
    logFinalReport();
  }
}

function closeFileStreams() {
  fileStream1.end();
  fileStream2.end();
}

function logFinalReport() {
  console.log(`Ending process at ${new Date(Date.now()).toISOString()}`);
  console.log(`Scanned items: ${scannedCount}.`);
  console.log(`Updated items: ${itemUpdates}.`);
  console.log(`Failed updates: ${itemFailures}.`);
}

function handleProcessSignal(signal) {
  console.log(`\nReceived ${signal} signal. Ending script execution.`);
  logFinalReport();
  process.exit();
}

process.on('SIGINT', () => handleProcessSignal('SIGINT'));
process.on('SIGTERM', () => handleProcessSignal('SIGTERM'));
process.on('SIGHUP', () => handleProcessSignal('SIGHUP'));

run();
