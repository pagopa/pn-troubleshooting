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
  { name: "awsRegion", mandatory: false },
  { name: "bucket", mandatory: true },
  { name: "searchPath", mandatory: false }
]

// Parsing degli argomenti da linea di comando.
// Se awsProfile e awsRegion non vengono impostati, verranno usati i default della macchina attuale.
const values = {
  values: { inputFile, awsProfile, awsRegion, bucket, searchPath },
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
    bucket: {
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
  paFileName = paFileName.startsWith("\"") && paFileName.endsWith("\"") ? paFileName.substring(1, paFileName.length - 2) : paFileName;
  const fileKey = splittedLine[2];

  if (searchPath) {
    paFileName = searchPath + "/" + paFileName;
    fileKey = searchPath + "/" + fileKey;
  }
  // Vanno recuperati solo i file che NON si trovano nel bucket di disponibilità
  if (!(await s3Service.isInBucket("pn-safestorage-eu-south-1-089813480515", fileKey))) {

    const record = await dynamoDbService.getItem("pn-SsDocumenti", fileKey);
    const object = await s3Service.getObject(bucket, paFileName);
    let objBA = await object.Body.transformToByteArray();
    let hashType = record.documentType.checksum;

    let s3CheckSum = hashObject(hashType, objBA);
    let dynamoDbChecksum = record.checkSum;
    if (hashType != "NONE") {
      retrieveFromOriginal(s3CheckSum, dynamoDbChecksum, objBA);
    } else {
      fs.appendFileSync("incoherent.txt", line + ";hashtype not available;" + new Date(Date.now()).toISOString() + "\r\n");
      return;
    }
  }
  // Il file è già presente nel bucket di disponibilità e lo segnaliamo.
  else fs.appendFileSync("incoherent.txt", `File with key "${fileKey}" is already in availability bucket.` + ";" + new Date(Date.now()).toISOString() + "\r\n");
}

async function retrieveFromOriginal(s3CheckSum, dynamoDbChecksum, objBA) {
  // Controllo se il checksum tra file e database è coerente.
  if (s3CheckSum != dynamoDbChecksum) {
    fs.appendFileSync("incoherent.txt", line + ";hash is not coherent;" + new Date(Date.now()).toISOString() + "\r\n");
    return;
  }
  var contentType = mime.lookup(fileKey) ? mime.lookup(fileKey) : null;
  // Ricarico il file con la fileKey di SS e cancello l'originale.
  s3Service.putObject(bucket, fileKey, contentType, objBA)
    .then(result => s3Service.deleteObject(bucket, paFileName));
}

// hashing dell'oggetto s3
function hashObject(hashType, objBA) {
  const hash = crypto.createHash(hashType);
  hash.update(objBA);
  s3CheckSum = hash.digest('base64');
  return s3CheckSum;
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