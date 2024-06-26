const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const { parseArgs } = require('util');
const fs = require('fs');
const readline = require("readline");


const args = [
    { name: "awsProfile", mandatory: false },
    { name: "inputFile", mandatory: true }
  ]
  
  const values = {
    values: { awsProfile, inputFile },
  } = parseArgs({
    options: {
      awsProfile: {
        type: "string",
      },
    
      inputFile: {
        type: "string",
      }
    },
  });

checkingParameters(args, values);


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
        if (el.mandatory && !values.values[el.name]) {
            console.log(`Param "${el.name}" is not defined`)
            process.exit(1)
        }
    });
}


async function readDeleteList(filePath) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    const deleteList = [];

    for await (const line of rl) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            deleteList.push(trimmedLine);
        }
    }
    return deleteList;
}

// Funzione per cancellare i record da DynamoDB
async function deleteRecordsFromDynamoDb(deleteList) {
    for (const key of deleteList) {
        const input = {
            TableName: tableName,
             "Key": {
                      "requestId": key
                    }
        };
        const command = new DeleteCommand(input);
        try {
            await dynamoDbDocumentClient.send(command);
            console.log(`Record deleted with key: ${key}`);
        } catch (error) {
            console.error(`Failed to delete record with key: ${key}`, error);
        }
    }
}


async function main() {
 
    const deleteList = await readDeleteList(inputFile);
    await deleteRecordsFromDynamoDb(deleteList);
}

main()
    .then((result) => console.log("Ending data cleanup."))
    .catch((error) => console.error("Exception during data cleanup :" + error));


