const { DynamoDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { parseArgs } = require('util');
const cliProgress = require('cli-progress');
const readline = require('readline');
const progressBar = new cliProgress.SingleBar({
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true
});
const fs = require('fs');
const process = require('node:process');


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

if (dryrun) { test = true; }

var confinfoCredentials;
if (awsProfile != null) { confinfoCredentials = fromSSO({ profile: awsProfile })(); }

const dynamoDbClient = new DynamoDBClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});
const dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient);
const tableName = "pn-EcRichiesteMetadati";

var itemFailures = 0;
var itemUpdates = 0;
var totalScannedRecords = 0;

if (test)
  scanLimit = 1;

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

async function recordsCleaningFromFile(requestIdsPath) {
  let requestIdsList = await getFileFromPath(requestIdsPath);

  const totalRecords = requestIdsList.length;
  var workedRecords = 0;
  progressBar.start(totalRecords, 0);

  await Promise.all(requestIdsList.map(async (requestId) => {
    progressBar.update(++workedRecords);
    await getRecord(requestId)
      .then(
        function (record) {
          if (record.lastUpdateTimestamp == null || (record.eventsList != null && record.eventsList[0].insertTimestamp == null)) {
            return updateRecord(record);
          }
        },
        function (error) {
          console.log("Error while getting record from table with requestId: " + requestId + ": " + error);
          itemFailures++;
          fs.appendFileSync("failures.csv", requestId + "," + error + "\r\n");
          return;
        }
      )
  }))
}

async function recordsCleaning() {
  const totalRecords = await getTotalRecords();
  progressBar.start(totalRecords, 0);
  var hasRecords = true;
  var input = {
    TableName: tableName,
    ProjectionExpression: "requestId, eventsList, version",
    FilterExpression: "attribute_not_exists(lastUpdateTimestamp) OR attribute_not_exists(eventsList[0].insertTimestamp)",
    Limit: scanLimit,
    ConsistentRead: true
  };

  while (hasRecords) {

    if (exclusiveStartKey != null) {
      input.ExclusiveStartKey = { "requestId": exclusiveStartKey };
    }

    await getRecords(input)
      .then(
        function (data) {
          totalScannedRecords += data.ScannedCount;
          progressBar.update(totalScannedRecords);
          if (data.LastEvaluatedKey == null || (test && itemUpdates >= 10)) {
            hasRecords = false;
          }
          else {
            exclusiveStartKey = data.LastEvaluatedKey.requestId;
          }
          return Promise.all(data.Items.map(async (record) => {
            await updateRecord(record);
          }));
        },
        function (error) {
          console.log(`Error while scanning table : ${error}`);
          console.log("Last evaluated key : " + exclusiveStartKey);
          hasRecords = false;
          throw (error);
        });
  }
}

async function getRecords(input) {
  const command = new ScanCommand(input);
  return dynamoDbDocumentClient.send(command);
}

//Viene preso l'eventTimestamp dell'ultimo evento della lista.
function getLastEventTimestamp(eventsList) {
  var lastEvent = eventsList[eventsList.length - 1];
  var lastEventTimestamp;
  if (lastEvent.digProgrStatus != null) {
    lastEventTimestamp = lastEvent.digProgrStatus.eventTimestamp;
  }
  else {
    lastEventTimestamp = lastEvent.paperProgrStatus.statusDateTime;
  }
  return new Date(Date.parse(lastEventTimestamp)).toISOString();
}

//La lista degli eventi viene ordinata in ordine cronologico ascendente.
function getOrderedEventsList(record) {
  return record.eventsList.sort(function (event1, event2) {
    var date1;
    var date2;
    if (event1.digProgrStatus != null) {
      date1 = Date.parse(event1.digProgrStatus.eventTimestamp);
      date2 = Date.parse(event2.digProgrStatus.eventTimestamp);
    }
    else {
      date1 = Date.parse(event1.paperProgrStatus.statusDateTime);
      date2 = Date.parse(event2.paperProgrStatus.statusDateTime);
    }
    return date1 - date2;
  });
}

//Aggiungo l'attributo "insertTimestamp" agli eventi fino a che non incontro un evento che ha già quell'attributo valorizzato.
//La funzione restituisce un booleano che indica se almeno un evento è stato aggiornato o meno.
function addInsertTimestampToEvents(eventsList) {
  var epochTime = 1;
  for (var i = 0; i < eventsList.length; i++) {
    var event = eventsList[i];
    if (event.insertTimestamp != null) {
      if (i == 0) { return false; }
      break;
    }
    event.insertTimestamp = new Date(epochTime).toISOString();
    epochTime++;
  }
  return true;
}

async function updateRecord(record) {
  try {
    var requestId = record.requestId;
    const currentVersion = record.version;
    var lastUpdateTimestamp;
    if (record.eventsList != null) {
      var orderedEventsList = getOrderedEventsList(record);
      lastUpdateTimestamp = getLastEventTimestamp(orderedEventsList);
      const hasUpdatedEventsList = addInsertTimestampToEvents(orderedEventsList);
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
        UpdateExpression: "SET #lctKey = if_not_exists(#lctKey, :lctValue), #version = :newVersion"
      };

      //Permette l'update della eventsList SOLAMENTE se almeno uno degli eventi è stato modificato col nuovo timestamp.
      if (hasUpdatedEventsList == true) {
        input.ExpressionAttributeNames["#elKey"] = "eventsList";
        input.ExpressionAttributeValues[":elValue"] = orderedEventsList;
        input.UpdateExpression += ", #elKey = :elValue"
      }

      if (test)
        fs.appendFileSync("test-records.csv", requestId.toString() + "\r\n");

      if (!dryrun) {
        const command = new UpdateCommand(input);
        await dynamoDbDocumentClient.send(command);
      }
    }
    else {
      console.warn(`\nNo events for record "${requestId}"`);
      return;
    }
  }
  catch (error) {
    console.warn(`\nError while updating record "${requestId}" : ${error}`);
    itemFailures++;
    fs.appendFileSync("failures.csv", requestId.toString() + "," + error + "\r\n");
    return;
  }
  itemUpdates++;
  return;
}

async function getTotalRecords() {
  var response = await dynamoDbClient.send(new DescribeTableCommand({ TableName: tableName }));
  return response.Table.ItemCount;
}

async function switchUpdateMethod() {
  if (requestIdsPath != null) {
    await recordsCleaningFromFile(requestIdsPath);
  } else {
    await recordsCleaning();
  }
}

switchUpdateMethod()
  .then(
    function (data) {
      progressBar.stop();
      console.log("Successful operation, ending process.");
      console.log(`Scanned items: ${totalScannedRecords}, Updated items: ${itemUpdates}. Last evaluated key : ${exclusiveStartKey}. Failures : ${itemFailures}. Check "failures.csv" file for individual failures.`);
      return;
    },
    function (error) {
      progressBar.stop();
      console.error(`* FATAL * Error in process : ${error}`);
      console.log(`Scanned items: ${totalScannedRecords}, Updated items: ${itemUpdates}. Last evaluated key : ${exclusiveStartKey}. Failures : ${itemFailures}. Check "failures.csv" file for individual failures.`);
    });


process.on('SIGINT', () => {
  console.log('Received SIGINT signal. Ending script execution.');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal. Ending script execution.');
});

process.on('SIGHUP', () => {
  console.log('Received SIGHUP signal. Ending script execution.');
});
