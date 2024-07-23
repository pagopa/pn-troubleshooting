const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const yargs = require('yargs');
const fs = require('fs');

const args = [
    { name: "awsProfile", mandatory: false },
    { name: "digitalRecordsNum", mandatory: true },
    { name: "paperRecordsNum", mandatory: true }
]

const values = yargs.options({
    awsProfile: {
        type: "string"
    },
    digitalRecordsNum: {
        type: "array"
    },
    paperRecordsNum: {
        type: "array"
    }
}).argv;

checkingParameters(args, values);

const awsProfile = values.awsProfile;
const digitalRecordsNum = values.digitalRecordsNum;
const paperRecordsNum = values.paperRecordsNum;

const DIGITAL = "DIGITAL";
const PAPER = "PAPER";

var jsonTemplates = {
    DIGITAL: [
        "json/digital/DigNotToUpdate.json",
        "json/digital/DigToUpdate.json",
        "json/digital/DigEventsToUpdate.json"
    ],
    PAPER: [
        "json/paper/PaperNotToUpdate.json",
        "json/paper/PaperToUpdate.json",
        "json/paper/PaperEventsToUpdate.json"
    ]
}

var confinfoCredentials;
if (awsProfile != null) { confinfoCredentials = fromSSO({ profile: awsProfile })(); }

const dynamoDbClient = new DynamoDBClient({
    credentials: confinfoCredentials,
    region: 'eu-south-1'
});
const dynamoDbDocumentClient = DynamoDBDocumentClient.from(dynamoDbClient);
const tableName = "pn-EcRichiesteMetadati";

// Metodo per controllare gli argomenti da linea di comando obbligatori.
function checkingParameters(args, values) {
    args.forEach(el => {
        if (el.mandatory && !values[el.name]) {
            console.log(`Param "${el.name}" is not defined`)
            process.exit(1)
        }
    });
}

// Metodo per creare dei record basati su dei template.
// Prende in ingresso:
//  - numArray ->  un array di interi, che indicano quanti record devono essere creati per tipologia di entry.
//  - type -> stabilisce se la richiesta è di tipo digitale o cartacea.
// Ad ogni posizione dell'array corrisponde una tipologia di entry:
//  - 0: Record non da sanare.
//  - 1: Record con lastUpdateTimestamp e insertTimestamp mancanti
//  - 2: Record con lastUpdateTimestamp presente ma alcuni eventi vecchi da sanare.
async function createRecords(numArray, type) {
    if (numArray.length != 3) throw new Error("The array size must be 3.")
    console.log(numArray);
    for (var i = 0; i < numArray.length; i++) {
        // Reperisco il nome del file relativo al template corretto.
        const templateFileName = jsonTemplates[type][i];
        // Mi istanzio un record a partire dal file json.
        const recordTemplate = JSON.parse(fs.readFileSync(templateFileName, "utf-8"));

        await putRecordsInDynamoDb(numArray[i], recordTemplate, getRequestIdPrefix(i, type));
    }
}

// Metodo per inserire nella pn-EcRichiesteMetadati un determinato record tante volte quante è indicato dal parametro "numOfRecords"
// Ogni record inserito ha una sua unica requestId. Il metodo genera anche un file di output dove vengono inserite tutte le requestId generate.
async function putRecordsInDynamoDb(numOfRecords, record, requestIdPrefix) {
    for (var i = 0; i < numOfRecords; i++) {
        requestId = requestIdPrefix + genRandomString(10);
        record.requestId = requestId;
        fs.appendFileSync("request-ids.txt", requestId + "\r\n");
        input = {
            TableName: tableName,
            Item: record
        };
        const command = new PutCommand(input);
        await dynamoDbDocumentClient.send(command);
    }
}

function getRequestIdPrefix(arrayPos, type) {
    var requestIdPrefix = "Test-" + type + "-";
    switch (arrayPos) {
        case 0: requestIdPrefix += "NotToUpdate"; break;
        case 1: requestIdPrefix += "ToUpdate"; break;
        case 2: requestIdPrefix += "EventsToUpdate"; break;
        default: throw new Error("Array position is not valid"); break;
    }
    return requestIdPrefix;
}


// Generate a random alphanumeric string with desired length
function genRandomString(length) {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
    var charLength = chars.length;
    var result = '';
    for (var i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * charLength));
    }
    return result;
}

async function main() {
    await createRecords(digitalRecordsNum, DIGITAL);
    await createRecords(paperRecordsNum, PAPER);
}

main()
    .then((result) => console.log("Ending data setup. Check 'request-ids.txt' file."))
    .catch((error) => console.error("Exception during data setup :" + error));


