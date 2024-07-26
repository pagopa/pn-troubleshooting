const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const fs = require('fs');
const process = require('node:process');
const { DynamoDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { StandardRetryStrategy } = require("@smithy/middleware-retry");
const { parseArgs } = require('util');
const cliProgress = require('cli-progress');
const readline = require('readline');

const progressBar = new cliProgress.SingleBar({
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
  noTTYOutput: true
});

console.log(`Starting process at ${new Date(Date.now()).toISOString()}`)

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
    awsProfile: {
      type: "string",
    },
    scanLimit: {
      type: "string",
    },
    test: {
      type: "boolean"
    },
    dryrun: {
      type: "boolean"
    },
    updateInsertTimestamp: {
      type: "boolean"
    },
    updateEventOrder: {
      type: "boolean"
    }
  },
});

const { awsProfile, scanLimit, test, dryrun, updateInsertTimestamp, updateEventOrder } = values;

if (test) { scanLimit = 1; }

var confinfoCredentials;
if (awsProfile != null) { confinfoCredentials = fromSSO({ profile: awsProfile })(); }

const customRetryDecider = (err) => {
  console.log("Retrying for exception : " + err);
  return true;
};

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
  region: 'eu-central-1',
  retryStrategy: retryStrategy
});
const dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient);
const tableName = "pn-EcRichiesteMetadati";
const outputFilePath1 = 'output_requestId-missing-insertTimestamp.txt';
const outputFilePath2 = 'output_requestId-insertTimestamp_disorder.txt';

const fileStream1 = createFileStream(outputFilePath1);
const fileStream2 = createFileStream(outputFilePath2);
const scanLimitParsed = parseInt(scanLimit) || null;

function createFileStream(filePath) {
  const fileStream = fs.createWriteStream(filePath, { flags: 'a' });
  fileStream.on('error', (err) => {
    console.error(`Errore durante la scrittura su ${filePath}: ${err}`);
  });
  return fileStream;
}

var totalItems = 0;
var itemUpdates = 0;
var itemFailures = 0;

async function scanTable(params, processItem) {
  let lastEvaluatedKey = null;
  let scannedCount = 0;
  let isScanning = true;

  // Pre-scan to get il numero totale degli item per la progress bar
  try {
    const countParams = { TableName: tableName, Select: 'COUNT' };
    const countData = await dynamoDbDocumentClient.send(new ScanCommand(countParams));
    totalItems = countData.Count || 0;
  } catch (err) {
    console.error('Errore durante il conteggio degli elementi nella tabella:', err);
    return;
  }

  // Inizializzazione progress bar
  progressBar.start(totalItems, 0);

  while (isScanning) {
    try {
      const data = await dynamoDbDocumentClient.send(new ScanCommand(params));
      const newItems = data.Items || [];

      for (const item of newItems) {
        await processItem(item);
      }

      scannedCount += newItems.length;
      progressBar.update(scannedCount);

      if (scanLimitParsed && scannedCount >= scanLimitParsed) {
        console.log('Limite di scansione raggiunto.');
        isScanning = false;
      }

      lastEvaluatedKey = data.LastEvaluatedKey;
      if (!lastEvaluatedKey) {
        console.log('Nessun LastEvaluatedKey, terminando la scansione.');
        isScanning = false;
      }
    } catch (err) {
      console.error('Errore durante la scansione della tabella:', err);
      isScanning = false;
    }
  }

  progressBar.stop();
}

// Check se le date passate come parametro sono in ordine
function isInChronologicalOrder(dates) {
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] < dates[i - 1]) {
      return false;
    }
  }
  return true;
}

//Scan e process items dalla tabella
async function scanAndProcessItems() {
  const params = {
    TableName: tableName,
    ProjectionExpression: "requestId, eventsList",
    FilterExpression: "attribute_exists(eventsList) AND attribute_exists(eventsList[0].paperProgrStatus) AND NOT attribute_type(eventsList[0].paperProgrStatus, :nullType)",
    ExpressionAttributeValues: {
      ":nullType": "NULL"
    },
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

      if (updateEventOrder === true) {
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

//get max insertTimestamp degli eventi con anno 1970
function getMaxInsertTimestamp(eventsList) {
  let maxTimestamp = new Date(0); // Initialize with epoch time
  eventsList.forEach(event => {
    if (event.insertTimestamp) {
      const timestamp = new Date(event.insertTimestamp);
      if (timestamp.getFullYear()===1970 && timestamp > maxTimestamp) {
        maxTimestamp = timestamp;
      }
    }
  });
  return maxTimestamp;
}

// Riordina gli eventi secondo insertTimestamp
function sortEventsByInsertTimestamp(eventsList) {
  return eventsList.sort((a, b) => {
    const aTime = a.insertTimestamp ? new Date(a.insertTimestamp).getTime() : 0;
    const bTime = b.insertTimestamp ? new Date(b.insertTimestamp).getTime() : 0;
    return aTime - bTime;
  });
}

/**
 * Update record nella tabella
 * @param {string} requestId
 * @param {string} insertTimestamp - il nuovo timestamp
 * @param {Object[]} eventsList - la lista degli eventi
 */
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
      Key: { requestId: requestId },
      UpdateExpression: "SET eventsList = :updatedEventsList",
      ExpressionAttributeValues: {
        ":updatedEventsList": updatedEventsList
      },
      ReturnValues: "UPDATED_NEW"
    };

    if (!dryrun) {
      await dynamoDbDocumentClient.send(new UpdateCommand(updateParams));
    }

    if (test) {
      fs.appendFileSync("test-records.csv", `${requestId}\n`);
    }
  } catch (error) {
    console.error(`Error while updating record with requestId: ${requestId}: ${error}`);
    itemFailures++;
    fs.appendFileSync("failures.csv", `${requestId}\n`);
  }
  itemUpdates++;
}

/**
 * Update record nella tabella
 * @param {string} requestId
 * @param {Object[]} sortedEventsList - eventi ordinati
 */
async function updateRecordEventListOrdered(requestId, sortedEventsList) {
  try {
    const updateParams = {
      TableName: tableName,
      Key: { requestId: requestId },
      UpdateExpression: "SET eventsList = :sortedEventsList",
      ExpressionAttributeValues: {
        ":sortedEventsList": sortedEventsList
      },
      ReturnValues: "UPDATED_NEW"
    };

    if (!dryrun) {
      await dynamoDbDocumentClient.send(new UpdateCommand(updateParams));
    }

    if (test) {
      fs.appendFileSync("test-records.csv", `${requestId}\n`);
    }
  } catch (error) {
    console.error(`Error while updating event list for record with requestId: ${requestId}: ${error}`);
    itemFailures++;
    fs.appendFileSync("failures.csv", `${requestId}\n`);
  }
  itemUpdates++;
}

async function run() {
  try {
    await scanAndProcessItems();
    console.log('File di output generati.');
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
  progressBar.stop();
  console.log(`Ending process at ${new Date(Date.now()).toISOString()}`);
  console.log(`Scanned items: ${totalItems}.`);
  console.log(`Updated items: ${itemUpdates}.`);
  console.log(`Failed updates: ${itemFailures}.`);
}

function handleProcessSignal(signal) {
  console.log(`Received ${signal} signal. Ending script execution.`);
  logFinalReport();
  process.exit();
}

process.on('SIGINT', () => handleProcessSignal('SIGINT'));
process.on('SIGTERM', () => handleProcessSignal('SIGTERM'));
process.on('SIGHUP', () => handleProcessSignal('SIGHUP'));

run();
