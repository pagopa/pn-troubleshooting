const { parseArgs } = require('util');
const fs = require('fs');
const readline = require("readline");
const DynamoDBService = require("./service/DynamoDBService")
const S3Service = require("./service/S3Service")
const cliProgress = require('cli-progress');
const crypto = require("crypto");
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
  { name: "bucket", mandatory: true }
]

// Parsing degli argomenti da linea di comando.
// Se awsProfile e awsRegion non vengono impostati, verranno usati i default della macchina attuale.
const values = {
  values: { inputFile, awsProfile, awsRegion, dryrun, bucket },
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
    bucket: {
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
  for await (const line of readLines(path)) {
    readItems++;
    await processLine(line)
      .then((result) => {
        workedItems++;
      })
      .catch((error) => {
        failedItems++;
        fs.appendFileSync("failures_2.txt", line + "," + error + "," + new Date(Date.now()).toISOString() + "\r\n");
      })
      .finally(() => {
        progressBar.update(readItems);
      });
  }
}

async function processLine(line) {
  // Esegui operazioni asincrone sulla riga
  console.log("Processing key ", line);
  let s3CheckSum;
  // recupero record da Dynamo
  const record = await dynamoDbService.getItem("pn-SsDocumenti", line);
  console.log("Dynamo record: \r\n", record);
  // recupero l'oggetto s3
  const object = await s3Service.getObject(bucket, line);
  console.log("S3 object: \r\n", object);
  // trasformo l'oggetto s3 in bytearray
  let objBA = await object.Body.transformToByteArray();

  // ricavo checkSum con cui hashare oggetto s3
  let hashType = record.documentType.checksum;
  console.log("Hashing with: ", hashType);

  // verifico che hashing sia disponibile
  if (hashType != "NONE") {
    s3CheckSum = hashObject(hashType, objBA);
  } else {
    fs.appendFileSync("incoherent_2.txt", line + ",hashtype not available," + new Date(Date.now()).toISOString() + "\r\n");
  }

  /*// ATTENZIONE: record.contentLenght fa riferimento alla property Dynamo in ambiente dev_confinfo, in caso di undefined controllare che typo persista
  console.log("record size: ", record.contentLenght);*/

  // verifico coerenza dell'hashing e dimensioni del file
  if (record.checkSum == s3CheckSum && record.contentLenght == object.ContentLength) {
    // console.log("document state:" ,record.documentState);
    if (record.documentState.toUpperCase() == "DELETED" || record.documentState.toUpperCase() == "ATTACHED") {
      //calcolo la data equivalente a oggi+120gg
      let in120Days = new Date();
      in120Days.setDate((in120Days.getDate() + 120));
      in120Days.setMilliseconds(0);
      // verifico che la retention del documento sia superiore a una settimana a partire da now()
      /*console.log("retention until: ", new Date(record.retentionUntil));
      console.log("in 120 days: ", in120Days);
      console.log("retention <= in120Days: ", (new Date(record.retentionUntil) <= in120Days));*/
      if (new Date(record.retentionUntil) <= in120Days) {
        fs.appendFileSync("incoherent_2.txt", line + ",expiration date in less than 120 days: " + record.retentionUntil + "," + new Date(Date.now()).toISOString() + "\r\n");
      } else {
        fs.appendFileSync("output_2.txt", line + "\r\n");
      }

    } else {
      fs.appendFileSync("incoherent_2.txt", line + ",incoherent status: " + record.documentState.toUpperCase() + "," + new Date(Date.now()).toISOString() + "\r\n");
    }
  } else {
    fs.appendFileSync("incoherent_2.txt", line + ",incoherent size or checksum," + new Date(Date.now()).toISOString() + "\r\n");
  }
}


// hashing dell'oggetto s3
function hashObject(hashType, objBA) {
  console.log("Starting file hashing...")

  const hash = crypto.createHash(hashType);
  const format = 'base64';

  hash.update(objBA);
  s3CheckSum = hash.digest(format);
  console.log("File hashing done!")
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
  console.log(`Check "failures_2.txt" file for individual failures.`)
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