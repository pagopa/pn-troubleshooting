const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { parseArgs } = require('util');
const fs = require('fs');

const args = [
  { name: "awsProfile", mandatory: true },
  { name: "exclusiveStartKey", mandatory: false },
  { name: "scanLimit", mandatory: false },
]

const values = {
  values: { awsProfile, scanLimit, exclusiveStartKey },
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
  },
});

args.forEach(k => {
  if (k.mandatory && !values.values[k.name]) {
    console.log("Parameter '" + k.name + "' is not defined")
    console.log("Usage: index.js --awsProfile <aws-profile>")
    process.exit(1)
  }
});

const confinfoCredentials = fromSSO({ profile: awsProfile })();
const dynamoDbClient = new DynamoDBClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});
const dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient);
const tableName = "pn-EcRichiesteMetadati";

var itemFailures = 0;
var itemUpdates = 0;
var totalScannedRecords = 0;

async function recordsCleaning() {
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
          if (data.LastEvaluatedKey == null) {
            hasRecords = false;
          }
          else {
            exclusiveStartKey = data.LastEvaluatedKey.requestId;
          }
          console.log(`Total scanned records : ${totalScannedRecords}.`);
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
  console.log(`Scanning table with input : ${JSON.stringify(input)}`);
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

      const command = new UpdateCommand(input);
      await dynamoDbDocumentClient.send(command);
    }
    else {
      console.warn(`No events for record "${requestId}"`);
      return;
    }
  }
  catch (error) {
    console.warn(`Error while updating record "${requestId}" : ${error}`);
    itemFailures++;
    fs.appendFileSync("failures.csv", requestId.toString() + "\r\n");
    return;
  }
  itemUpdates++;
  return;
}

recordsCleaning()
  .then(
    function (data) {
      console.log("Successful operation, ending process.");
      console.log(`Updated items: ${itemUpdates}. Last evaluated key : ${exclusiveStartKey}. Failures : ${itemFailures}. Check "failures.csv" file for individual failures.`);
      return;
    },
    function (error) {
      console.error(`* FATAL * Error in process : ${error}`);
      console.log(`Updated items: ${itemUpdates}. Last evaluated key : ${exclusiveStartKey}. Failures : ${itemFailures}. Check "failures.csv" file for individual failures.`);
    });