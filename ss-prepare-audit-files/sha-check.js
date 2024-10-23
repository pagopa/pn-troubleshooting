const { parseArgs } = require('util');
const fs = require('fs');
const readline = require("readline");
const DynamoDBService = require("./service/DynamoDBService");
const S3Service = require("./service/S3Service");
const cliProgress = require('cli-progress');
const crypto = require("crypto");
var mime = require('mime-types');
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
  { name: "searchPath", mandatory: false }
];

// Parsing degli argomenti da linea di comando.
const values = {
  values: { inputFile, awsProfile, awsRegion, sourceBucket, searchPath },
} = parseArgs({
  options: {
    inputFile: { type: "string" },
    awsProfile: { type: "string" },
    awsRegion: { type: "string" },
    sourceBucket: { type: "string" },
    searchPath: { type: "string" },
  },
});
checkingParameters(args, values);

// Contatori
var totalItemCount;
var readItems = 0;
var workedItems = 0;
var failedItems = 0;

const outputFile = 'output.txt';
const incoherentFile = 'incoherent.txt';
const hashKeyMap = new Map();



// Definizione dei service per operazioni sui servizi AWS.
const dynamoDbService = new DynamoDBService(awsProfile, awsRegion);
const s3Service = new S3Service(awsProfile, awsRegion);

// Metodo per controllare gli argomenti da linea di comando obbligatori.
function checkingParameters(args, values) {
  args.forEach(el => {
    if (el.mandatory && !values.values[el.name]) {
      console.log(`Param "${el.name}" is not defined`);
      process.exit(1);
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

// Conteggio del numero di righe del file.
async function countLines(path) {
  let lineCount = 0;
  for await (const line of readLines(path)) {
    lineCount++;
  }
  return lineCount;
}

// Per ogni riga, applichiamo un'operazione asincrona.
async function processLines(path) {
  await checkBucketsExistence([sourceBucket]);

 var hashKeyMap = await createHashKeyMap(sourceBucket);

  for await (const line of readLines(path)) {
    readItems++;
    await processLine(line, hashKeyMap)
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
    checkForIncoherentItems(hashKeyMap);

}

async function listAllS3Keys(bucketName) {
    let isTruncated = true;
    let continuationToken = null;
    const keys = [];

    while (isTruncated) {
      const params = {
        Bucket: bucketName,
        ContinuationToken: continuationToken
      };

      try {
        const response = await s3Service.listObjectsV2(bucketName, searchPath ? searchPath + "/" : "");

        if (response.length > 0) {
          keys.push(...response.map(item => item.Key));
        } else {
          console.warn("La risposta è vuota.");
        }

        isTruncated = response.IsTruncated; // verifica se ci sono altri oggetti
        continuationToken = response.NextContinuationToken; // Token per il prossimo batch
      } catch (error) {
        console.error("Errore durante il recupero delle chiavi S3:", error);
        throw error;
      }
    }
    return keys;
  }

  async function createHashKeyMap(bucketName) {
    try {
      // Recupera tutte le chiavi degli oggetti nel bucket e percorso specificati
      const keys = await listAllS3Keys(bucketName);

      for (const key of keys) {
        try {
          // Effettua la getObject per ogni chiave
          const s3Object = await s3Service.getObject(bucketName, key);
          let s3ObjectBA = await s3Object.Body.transformToByteArray();
          let computedSha256 = hashObject('sha256', s3ObjectBA);
          computedSha256 = computedSha256.startsWith("\"") && computedSha256.endsWith("\"") ? computedSha256.substring(1, computedSha256.length - 1) : computedSha256;

          //bool per il check sulla corrispondenza: impostato a false perchè all'inizio non so ancora se sono presenti nel file in input
           hashKeyMap.set(computedSha256, { key: key, foundInInput: false });


        } catch (err) {
          console.error(`Errore durante l'elaborazione dell'oggetto S3 con chiave ${key}:`, err);
          fs.appendFileSync("failures.txt", `Errore per la chiave ${key}: ${err.message}\n`);
        }
      }
      return hashKeyMap;
    } catch (error) {
      console.error("Errore durante il recupero delle chiavi S3: ", error);
    }
  }


async function processLine(line, hashKeyMap) {
  const splittedLine = line.split(",");
  var iun = splittedLine[0];
  var title = splittedLine[1];
  var safestorage = splittedLine[2];
  var sha256 = splittedLine[3];
const paFileInfo = hashKeyMap.get(sha256);
sha256 = sha256.startsWith("\"") && sha256.endsWith("\"") ? sha256.substring(1, sha256.length - 1) : sha256;
if (paFileInfo) {
    paFileInfo.foundInInput = true;  // l'oggetto è stato trovato nel file di input
    const fileName = paFileInfo.key.substring(paFileInfo.key.lastIndexOf('/') + 1);
    fs.appendFileSync(outputFile, `${iun},${fileName},${safestorage},${sha256}\n`);
} else {
    // scrivo nel file incoherent.txt se non si trova corrispondenza
    fs.appendFileSync(incoherentFile, `SHA ${sha256} not found in S3 for IUN ${iun}\n`);
}


}

// hashing dell'oggetto s3
function hashObject(hashType, s3ObjectBA) {
  const hash = crypto.createHash(hashType);
  hash.update(s3ObjectBA);
  return hash.digest('base64');
}

async function checkBucketsExistence(buckets) {
  for (bucket of buckets) {
    console.log("Checking if bucket " + bucket + " exists...");
    await s3Service.headBucket(bucket);
  }
}

// Funzione per inizializzare il file di output con l'intestazione
function initializeOutputFile() {
    const header = 'iun,title,safestorage,sha256\n';
    fs.writeFileSync(outputFile, header);
}

/**
Verifica se ci sono degli sha in s3 ma non nel file in input
se bool è rimasto false, significa che esiste su s3 ma non nel file di input
*/
function checkForIncoherentItems(hashKeyMap) {
  for (const [sha, value] of hashKeyMap) {
    if (!value.foundInInput) {
      const fileName = value.key.substring(value.key.lastIndexOf('/') + 1);

      fs.appendFileSync(incoherentFile, `SHA ${sha} found in S3 but not in input file. Key: ${fileName}\n`);
    }
  }
}

async function main() {
  console.log(`Starting process at ${new Date(Date.now()).toISOString()}`);
  initializeOutputFile();
  totalItemCount = await countLines(inputFile);
  progressBar.start(totalItemCount, 0);
  await processLines(inputFile);
}

function logFinalReport() {
  console.log(`Ending process at ${new Date(Date.now()).toISOString()}`);
  console.log(`Total items : ${totalItemCount}, Read items: ${readItems}, Worked items: ${workedItems}. Failures : ${failedItems}.`);
  console.log(`Check "failures.txt" file for individual failures.`);
}

// Esecuzione del metodo principale
main().then((result) => {
  progressBar.stop();
  console.log("Successful operation.");
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
