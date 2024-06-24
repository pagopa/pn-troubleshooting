const { parseArgs } = require('util');
const fs = require('fs');
const readline = require("readline");
const DynamoDBService = require("./service/DynamoDBService")
const S3Service = require("./service/S3Service")
const QueueUtils = require("./service/QueueUtils")
const cliProgress = require('cli-progress');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { type } = require('os');

const progressBar = new cliProgress.SingleBar({
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
  noTTYOutput: true
});

// Definizione delle costanti da mappare sugli argomenti da linea di comando.
const args = [
  { name: "inputFile", mandatory: true },
  { name: "awsProfile", mandatory: false },
  { name: "awsRegion", mandatory: false },
  { name: "dryrun", mandatory: false },
  { name: "newStatus", mandatory: true},
  { name: "retentionCheck", mandatory: false},
  { name: "queuesNames", mandatory: false},
  { name: "uriUpdateMetadata", mandatory: true},
  { name: "sCxId", mandatory:true },
  { name: "sAPIKey", mandatory: true },
  { name: "baseUrl", mandatory: true }
]

// Parsing degli argomenti da linea di comando.
// Se awsProfile e awsRegion non vengono impostati, verranno usati i default della macchina attuale.
const values = {
  values: { inputFile, awsProfile, awsRegion, dryrun, newStatus, retentionCheck, queuesNames, uriUpdateMetadata, sCxId, sAPIKey, baseUrl },
} = parseArgs({
  options: {
    inputFile: {
      type: "string",
    },
    awsProfile: {
      type: "string",
    },
    awsRegion: {
      type: "string",
    },
    dryrun: {
      type: "boolean",
    },
    newStatus: {
      type: "string"
    },
    retentionCheck: {
      type: "boolean"
    },
    queuesNames: {
      type: "string",
      multiple: true
    },
    uriUpdateMetadata: {
      type: "string"
    },
    sCxId: {
      type: "string"
    },
    sAPIKey: {
      type: "string"
    },
    baseUrl: {
      type: "string"
    },
  },
});
checkingParameters(args, values);

//table
const tableName = "pn-SsDocumenti";

// Contatori
var totalItemCount;
var readItems = 0;
var workedItems = 0;
var failedItems = 0;

// Definizione dei service per operazioni sui servizi AWS.
const dynamoDbService = new DynamoDBService(awsProfile, awsRegion);
const s3Service = new S3Service(awsProfile, awsRegion);
const sqsUtils = new QueueUtils(awsRegion);


// Metodo per controllare gli argomenti da linea di comando obbligatori.
function checkingParameters(args, values) {
  args.forEach(el => {
    if (el.mandatory && !values.values[el.name]) {
      console.log(`Param "${el.name}" is not defined`)
      process.exit(1)
    }
  });
}

// Lettura del file riga per riga tramite generator function.
async function* readLines(path) {
  const fileStream = fs.createReadStream(path);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.length > 0) {
      yield line;
    }
  }
}

// Conteggio del numero di righe del file, e quindi degli item da lavorare.
async function countLines(path) {
  let lineCount = 0;

  for await (const line of readLines(path)) {
    lineCount++;
  }

  return lineCount;
}


// Per ogni riga, applichiamo un'operazione asincrona.
async function processLines(path) {
  if (!newStatus) {
    console.error("Error: newStatus is not defined or is empty");
  }
  for await (const line of readLines(path)) {
    readItems++;
    await processLine(line, newStatus)
      .then((result) => {
        workedItems++;
      })
      .catch((error) => {
        failedItems++;
        fs.appendFileSync("failures_6.txt", line + "," + error + "," + new Date(Date.now()).toISOString() + "\r\n");
      })
      .finally(() => {
        progressBar.update(readItems);
      });
  }
}

async function processLine(line) {
  console.log("Processing line: ", line);
  const item = await dynamoDbService.getItem(tableName, line);
  if (item && item.documentState === "available") {

   /* controllo rimosso perchè presente in script ss-coherence-check

   if (retentionCheck && item.retentionUntil) {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // now + 7gg
      const retentionUntilDate = new Date(item.retentionUntil);

      if (retentionUntilDate > futureDate) {
        console.log(`Retention date for ${line} is in the future.`);

        // Aggiorna retentionUntil aggiungendo 1 secondo
        const newRetentionUntil = new Date(retentionUntilDate.getTime() + 1000).toISOString();

        updateExpressionDynamic += ", #retentionUntil = :newRetentionUntil";
        expressionAttributeValuesDynamic[":newRetentionUntil"] = newRetentionUntil;
        expressionAttributeNamesDynamic["#retentionUntil"] = "retentionUntil";
      }
    }
      */
    if (dryrun) {
      console.log("Dry run: ", line);
      await writeLines('output_6.txt', [line]);
    } else {
      // Eseguo chiamata updateMetadata con i valori aggiornati
      await updateObjectMetadata(sCxId, sAPIKey, baseUrl, uriUpdateMetadata, line, newStatus);
      console.log("Success for fileKey ", line);
        await writeLines('output_6.txt', [line]);
      }
    } else {
      const incoherentEntry = `${line};${item ? item.documentState : 'undefined'};${new Date().toISOString()}`;
      await writeLines('incoherent_6.txt', [incoherentEntry]);
    }

}

function stdReq() {
  return {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'x-amzn-trace-id': uuidv4()
    }
  };
}

async function updateObjectMetadata(sCxId, sAPIKey, baseUrl, uriUpdateMetadata, sFileKey, newStatus) {
  const url = `${baseUrl}${uriUpdateMetadata}${sFileKey}`;
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'x-amzn-trace-id': uuidv4(),
    'x-pagopa-safestorage-cx-id': sCxId,
    'x-api-key': sAPIKey
  };

  const now = new Date();
const formattedDate = now.toISOString();
  
const body = {
    status: newStatus
  };

  try {
    const response = await axios.post(url, body, { headers });
    return response.data;
  } catch (error) {
    console.error(`Failed to update metadata for ${sFileKey}: `, error.message);
    if (error.response) {
      console.error('Error setting up request: ', error.message);
    }
    console.error(`Failed to update metadata for ${sFileKey}: `, error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error(`Connection refused at ${url}. Please check the server and the URL.`);
    }
    throw error;
  }
}

// Scrittura del file riga per riga.
async function writeLines(path, lines) {
  const fileStream = fs.createWriteStream
    (path, { flags: 'a' });
  for await (const line of lines) {
    fileStream.write(line + '\n');
  }
}

// Metodo principale
async function main() {
  console.log(`Starting process at ${new Date(Date.now()).toISOString()}`)
  totalItemCount = await countLines(inputFile);
  progressBar.start(totalItemCount, 0);

  if (queuesNames) {
      sqsUtils.getQueueUrls(queuesNames);
  }
  await processLines(inputFile);
}


function logFinalReport() {
  console.log(`Ending process at ${new Date(Date.now()).toISOString()}`)
  console.log(`Total items : ${totalItemCount}, Read items: ${readItems}, Worked items: ${workedItems}. Failures : ${failedItems}.`);
  console.log(`Check "failures.txt" file for individual failures.`)
}

// Esecuzione del metodo principale
main().then((result) => {
  progressBar.stop();
  console.log("Successfull operation.");
}).catch((err) => {
  progressBar.stop();
  console.log("*FATAL* Exception in process : " + err);
}).finally(() => {
  logFinalReport();
});

// Gestione dei segnali provenienti dal processo.
function handleProcessSignal(signal) {
  console.log(`Received ${signal} signal. Ending script execution.`);
  process.exit();
}

process.on('SIGINT', handleProcessSignal);
process.on('SIGTERM', handleProcessSignal);
process.on('SIGHUP', handleProcessSignal);


