const { parseArgs } = require('util');
const fs = require('fs');
const readline = require("readline");
const DynamoDBService = require("./service/DynamoDBService")
const S3Service = require("./service/S3Service")
const cliProgress = require('cli-progress');
const progressBar = new cliProgress.SingleBar({
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
  noTTYOutput: true
});

// Definizione delle costanti da mappare sugli argomenti da linea di comando.
const args = [
  { name: "savedRecords", mandatory: true },
  { name: "fileKeys", mandatory: true },
  { name: "awsProfile", mandatory: false },
  { name: "awsRegion", mandatory: false }
]

// Parsing degli argomenti da linea di comando.
// Se awsProfile e awsRegion non vengono impostati, verranno usati i default della macchina attuale.
const values = {
  values: { savedRecords, fileKeys, awsProfile, awsRegion },
} = parseArgs({
  options: {
    savedRecords: {
      type: "string",
    },
    fileKeys: {
      type: "string",
    },
    awsProfile: {
      type: "string",
    },
    awsRegion: {
      type: "string",
    }
  },
});
checkingParameters(args, values);

const SEP = ";";

// Contatori
var totalItemCount;
var readItems = 0;
var workedItems = 0;
var failedItems = 0;

// Definizione dei service per operazioni sui servizi AWS.
const dynamoDbService = new DynamoDBService(awsProfile, awsRegion);
const s3Service = new S3Service(awsProfile, awsRegion);

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
async function processLines(path, set) {
  for await (const line of readLines(path)) {
    readItems++;
    const array = line.split(/;(.+)/);
    const fileKey = array[0];
    const savedRecord = JSON.parse(array[1]);
    await processLine(fileKey, savedRecord, set)
      .then((result) => {
        workedItems++;
      })
      .catch((error) => {
        failedItems++;
        fs.appendFileSync("failures.txt", fileKey + SEP + error + SEP + new Date(Date.now()).toISOString() + "\r\n");
      })
      .finally(() => {
        progressBar.update(readItems);
      });
  }
}

async function processLine(fileKey, savedRecord, set) {
  if (set.has(fileKey)) {
    await coherenceCheck(fileKey, savedRecord);
  }
  else fs.appendFileSync("ignored.txt", fileKey + "\r\n");
}

async function coherenceCheck(fileKey, savedRecord) {
  const record = await dynamoDbService.getItem("pn-SsDocumenti", fileKey);
  const differences = getDifferences(record, savedRecord);
  if (differences.length == 0)
    fs.appendFileSync("output.txt", fileKey + "\r\n");
  else fs.appendFileSync("incoherent.txt", fileKey + SEP + JSON.stringify(differences) + "\r\n");
}

function getDifferences(record1, record2) {
  const fieldsToCheck = ["documentState", "documentLogicalState", "contentType", "clientShortCode", "checkSum", "documentKey", "contentLenght"]
  let differences = [];
  fieldsToCheck.forEach(fieldName => {
    if (record1[fieldName] !== record2[fieldName])
      differences.push({
        field: fieldName,
        value1: record1[fieldName],
        value2: record2[fieldName]
      })
  });
  return differences;
}

// Metodo principale
async function main() {
  console.log(`Starting process at ${new Date(Date.now()).toISOString()}`)
  totalItemCount = await countLines(savedRecords);
  progressBar.start(totalItemCount, 0);
  fileKeysSet = new Set();
  for await (const line of readLines(fileKeys)) {
    fileKeysSet.add(line);
  }
  await processLines(savedRecords, fileKeysSet);
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


