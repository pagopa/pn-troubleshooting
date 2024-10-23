const { parseArgs } = require('util');
const fs = require('fs');
const readline = require("readline");
const DynamoDBService = require("./service/DynamoDBService")
const S3Service = require("./service/S3Service")
const cliProgress = require('cli-progress');
const crypto = require("crypto");
var mime = require('mime-types')
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
  { name: "awsRegion", mandatory: true },
  { name: "sourceBucket", mandatory: true },
  { name: "availabilityBucket", mandatory: true },
  { name: "searchPath", mandatory: false }
]

// Parsing degli argomenti da linea di comando.
// Se awsProfile e awsRegion non vengono impostati, verranno usati i default della macchina attuale.
const values = {
  values: { inputFile, awsProfile, awsRegion, sourceBucket, availabilityBucket, searchPath },
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
    sourceBucket: {
      type: "string",
    },
    availabilityBucket: {
      type: "string",
    },
    searchPath: {
      type: "string",
    },
  },
});
checkingParameters(args, values);

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

  var isFirstLine = true;
  for await (const line of rl) {
    // Saltiamo la prima riga del file .csv
    if (line.length > 0 && !isFirstLine) {
      yield line;
    }
    isFirstLine = false;
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
  await checkBucketsExistence([sourceBucket, availabilityBucket]);
  for await (const line of readLines(path)) {
    readItems++;
    await processLine(line)
      .then((result) => {
        workedItems++;
      })
      .catch((error) => {
        failedItems++;
        fs.appendFileSync("failures.txt", line + ";" + error + ";" + new Date(Date.now()).toISOString() + "\r\n");
      })
      .finally(() => {
        progressBar.update(readItems);
      });
  }
}

async function processLine(line) {
  const splittedLine = line.split(",");
  var paFileName = splittedLine[1];
  // Se il nome del file è tra virgolette, le rimuoviamo
  paFileName = paFileName.startsWith("\"") && paFileName.endsWith("\"") ? paFileName.substring(1, paFileName.length - 1) : paFileName;
  var ssFileKey = splittedLine[2];

if (ssFileKey.includes("/")) {
    ssFileKey = ssFileKey.substring(ssFileKey.lastIndexOf("/") + 1);
  }

  // Vanno recuperati solo i file che NON si trovano nel bucket di disponibilità
  if (!(await s3Service.isInBucket(availabilityBucket, ssFileKey))) {

    // Se è stato indicato un path di ricerca, creo delle variabili che si riferiscono alle fileKey prefissate con quel path.
    if (searchPath) {
      var paFileNameWithPrefix = searchPath + "/" + paFileName;
      var ssFileKeyWithPrefix = searchPath + "/" + ssFileKey;
    }

    const dynamoDbRecord = await dynamoDbService.getItem("pn-SsDocumenti", ssFileKey);
    const s3Object = await s3Service.getObject(sourceBucket, paFileNameWithPrefix != null ? paFileNameWithPrefix : paFileName);
    let s3ObjectBA = await s3Object.Body.transformToByteArray();
    let hashType = dynamoDbRecord.documentType.checksum;

    let s3CheckSum = hashObject(hashType, s3ObjectBA);
    let dynamoDbChecksum = dynamoDbRecord.checkSum;
    if (hashType != "NONE") {
      await retrieveFromOriginal(ssFileKeyWithPrefix != null ? ssFileKeyWithPrefix : ssFileKey, s3CheckSum, dynamoDbChecksum, s3ObjectBA);
    } else {
      fs.appendFileSync("incoherent.txt", ssFileKey + ";hashtype not available;" + new Date(Date.now()).toISOString() + "\r\n");
      return;
    }
  }
  // Il file è già presente nel bucket di disponibilità e lo segnaliamo.
  else fs.appendFileSync("incoherent.txt", `File with key "${ssFileKey}" is already in availability bucket.` + ";" + new Date(Date.now()).toISOString() + "\r\n");
}

async function retrieveFromOriginal(ssFileKey, s3CheckSum, dynamoDbChecksum, s3ObjectBA) {
  // Controllo se il checksum tra file e database è coerente.
  if (s3CheckSum != dynamoDbChecksum) {
    fs.appendFileSync("incoherent.txt", ssFileKey + ";hash is not coherent;" + new Date(Date.now()).toISOString() + "\r\n");
    return;
  }
  var contentType = mime.lookup(ssFileKey) ? mime.lookup(ssFileKey) : null;
  // Ricarico il file con la fileKey di SS.
  await s3Service.putObject(sourceBucket, ssFileKey, contentType, s3ObjectBA);

  fs.appendFileSync("output.txt", ssFileKey + "\r\n");
}

// hashing dell'oggetto s3
function hashObject(hashType, s3ObjectBA) {
  const hash = crypto.createHash(hashType);
  hash.update(s3ObjectBA);
  s3CheckSum = hash.digest('base64');
  return s3CheckSum;
}

async function checkBucketsExistence(buckets) {
  for (bucket of buckets) {
    console.log("Checking if bucket " + bucket + " exists...");
    await s3Service.headBucket(bucket);
  }
}

// Metodo principale
async function main() {
  console.log(`Starting process at ${new Date(Date.now()).toISOString()}`)
  totalItemCount = await countLines(inputFile);
  progressBar.start(totalItemCount, 0);
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