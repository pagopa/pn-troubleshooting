import { fromIni, fromSSO } from "@aws-sdk/credential-providers";
import { DynamoDBDocument, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { writeFile, appendFile } from 'fs';
import { EOL } from 'os';

const cmdLineArgs = process.argv ;

if(cmdLineArgs.length<5){
  console.error("Usage: ", process.argv[1], "<aws-core-profile> <start-date> <end-date>");
  process.exit(1);
}

const awsProfile = cmdLineArgs[2]

console.log("Using profile " + awsProfile)

let credentials = null

console.log("Using profile " + awsProfile)

let config = null

process.env.AWS_SDK_LOAD_CONFIG=1
if(awsProfile.indexOf('sso_')>=0){ // sso profile
  console.log("Using profile SSO");
  config = { credentials: fromSSO({profile:awsProfile}), region: "eu-south-1" };
} else { // IAM profile
  config = { credentials: fromIni({profile:awsProfile}), region: "eu-south-1" };
}

const filterKey = 'created'; // Sostituisci con il nome del tuo attributo di chiave primaria
const startFilterValue = cmdLineArgs[3];
const endFilterValue = cmdLineArgs[4];
const errorField = 'error'
const status = 'CON996'
const date = new Date();
const filename = 'paperRequestError_deleted_backup'+ date.toISOString() +'.json';

async function sleep( ms ) {
  return new Promise( ( accept, reject) => {
    setTimeout( () => accept(null) , ms );
  })
}

async function getCancelledTimeline(iun) {
    const dynamoDB = DynamoDBDocument.from(new DynamoDB(config));
    const timelineElementId='NOTIFICATION_CANCELLED.IUN_'+iun;
    const timelineQueryParam = {
      TableName: 'pn-Timelines',
      KeyConditionExpression: 'iun = :iun AND timelineElementId = :timelineElementId',
      ExpressionAttributeValues: {
          ':iun': iun,
          ':timelineElementId': timelineElementId
      },
      Select: 'SPECIFIC_ATTRIBUTES',
      ProjectionExpression: 'iun, category, timelineElementId'
    };

    try {
      const query_results = await dynamoDB.query(timelineQueryParam);
      const timelineElement = query_results.Items[0];
      //console.log("timelineElement = " + JSON.stringify(timelineElement));
      return timelineElement;
    } catch (error) {
      console.error('Errore:', error);
      throw error;
    }
}

async function getPaperRequestErrors(startKey) {
  const paperRequestErrorQueryParam = {
    TableName: 'pn-PaperRequestError',
    FilterExpression: `#${errorField} = :keystatus and #${filterKey} >= :startvalue and #${filterKey} < :endvalue`,
    ExpressionAttributeNames: {
      [`#${filterKey}`]: filterKey,
      [`#${errorField}`]: errorField
    },
    ExpressionAttributeValues: {
      ':startvalue': startFilterValue,
      ':endvalue': endFilterValue,
      ':keystatus': status
    },
    Select: 'ALL_ATTRIBUTES',
    ExclusiveStartKey: startKey
  };

  const dynamoDB = DynamoDBDocument.from(new DynamoDB(config));
  try {
    const scan_results = await dynamoDB.scan(paperRequestErrorQueryParam);
    const filtered_result = scan_results.Items;
    for (let item of filtered_result) {
      processPaperRequestErrorItem(item);
      await sleep(2000);
    }
    if (scan_results?.LastEvaluatedKey) {
      return getPaperRequestErrors(scan_results.LastEvaluatedKey);
    }
  } catch (error) {
    console.error('Errore:', error);
    throw error;
  }
}

async function processPaperRequestErrorItem(item) {
  let requestId = item['requestId'];
  console.log("PROCESSING requestId:", requestId);
  let match = requestId.match(/PREPARE_ANALOG_DOMICILE\.IUN_([A-Z0-9-]+)\.RECINDEX_([\d]+)\.ATTEMPT_([\d]+)/)
  let iun = match[1];
  let timelineElement = await getCancelledTimeline(iun);
  if (timelineElement == undefined) {
    console.log(" +",requestId, "Not Cancelled", iun)
  } else {
    //console.log("Cancelled: ", requestId, iun, timelineElement.timestamp);
    console.log(" -", requestId, "Cancelled", iun);
    deletePaperRequestError(item)
    appendFile(filename, JSON.stringify(item, null, 2), err => {
      if (err) {
        console.error(err);
      }
    });
  }
}

async function deletePaperRequestError(item) {
  const dynamoDB = DynamoDBDocument.from(new DynamoDB(config));
  const params = {
    TableName: "pn-PaperRequestError",
    Key: {
      "requestId": item.requestId,
      "created": item.created
    }
  };
  //console.log("params", params);
  dynamoDB.delete(params, function(err, data) {
    if (err) {
      console.log("Error", err);
    } else {
      console.log("Success", data);
    }
  });
}

// Utilizzo dell'esempio
getPaperRequestErrors(undefined);

//  getCancelledTimeline("JWNV-LEGA-JGAJ-202310-P-2").then(timelineElement => {
//    console.log("timelineElement", JSON.stringify(timelineElement));
//  })
