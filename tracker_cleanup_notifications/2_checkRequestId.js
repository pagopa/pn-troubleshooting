/*
Legge il JSONL da 1_readMessages e verifica che i requestId esistano in Pn-PaperTrackings

Variabili d'ambiente:
- CORE_AWS_PROFILE: profilo AWS SSO
- INPUT_FILE: file JSONL degli eventi della DLQ (es. out/1_readMessages/20250904122434.jsonl)
- REGION: default eu-south-1
Output:
- FOUND_<timestamp>.jsonl
- NOT_FOUND_<timestamp>.txt (lista di requestId ORDINATI non trovati in Pn-PaperTrackings, con TUTTI i PCRETRY della spedizione)
- ERROR_<timestamp>.jsonl (in caso di errori di comunicazione con DynamoDB)
*/

import fs from "fs";
import path from "path";
import readline from "readline";
import { DynamoDBClient, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import { fromSSO } from "@aws-sdk/credential-providers";

const coreAwsProfile = process.env.CORE_AWS_PROFILE;
const region = process.env.REGION || "eu-south-1";
const inputFile = process.env.INPUT_FILE; // es. "out/1_readMessages/20250904122434.jsonl"
const retryLimit = 3; // retry per batch in caso di errore

if (!coreAwsProfile || !inputFile) {
  console.error("Errore: devi definire CORE_AWS_PROFILE e INPUT_FILE");
  process.exit(1);
}

console.log("======= Config =======");
console.log("CORE_AWS_PROFILE:", coreAwsProfile);
console.log("REGION:", region);
console.log("INPUT_FILE:", inputFile);
console.log("======================");

// Timestamp file di output
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);

// Directory output
const outDir = path.join("out", "2_checkRequestId");
if (!fs.existsSync(outDir)) 
    fs.mkdirSync(outDir, { recursive: true });

// Client DynamoDB
const dynamoCore = new DynamoDBClient({
  region,
  credentials: fromSSO({ profile: coreAwsProfile }),
});

/**
 * Mostra una barra di progresso in console
 */
function showProgress(current, total) {
  const barLength = 40;
  const percentage = Math.min(100, Math.floor((current / total) * 100));
  const filledLength = Math.floor((barLength * current) / total);
  const emptyLength = barLength - filledLength;
  
  const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  const line = `\r[${bar}] ${percentage}% (${current}/${total})`;
  
  process.stdout.write(line);
  
  if (current >= total) {
    process.stdout.write('\n');
  }
}

/**
 * Legge il file JSONL e restituisce i requestId unici e ordinati alfabeticamente
 */
async function extractUniqueRequestIds(filePath) {
  const set = new Set();

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      const json = JSON.parse(line);
      const requestId = json?.analogMail?.requestId;
      if (requestId) set.add(requestId);
    } catch (err) {
      console.error("Errore parsing riga JSON:", err);
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Dato un array di requestId, aggiunge i PCRETRY mancanti
 * mantenendo unici e ordinati alfabeticamente.
 */
function fillMissingPcretries(requestIds) {
  const set = new Set(requestIds);

  for (const id of requestIds) {
    const match = id.match(/^(.*\.PCRETRY_)(\d+)$/);
    if (match) {
      const prefix = match[1];
      const current = parseInt(match[2], 10);

      // aggiungo tutti i PCRETRY precedenti
      for (let i = 0; i < current; i++) {
        set.add(`${prefix}${i}`);
      }
    }
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Batch read su DynamoDB con retry
 */
async function checkTrackingBatch(requestIds) {
  const found = [];
  const notFound = [];
  const errors = [];

  const BATCH_SIZE = 100; // batch size BatchGetItem per DynamoDB

  for (let i = 0; i < requestIds.length; i += BATCH_SIZE) {
    const batch = requestIds.slice(i, i + BATCH_SIZE);
    let attempts = 0;
    let success = false;

    while (attempts < retryLimit && !success) {
      try {
        const keys = batch.map(id => ({ trackingId: { S: id } }));
        const result = await dynamoCore.send(
          new BatchGetItemCommand({
            RequestItems: {
              "pn-PaperTrackings": {
                Keys: keys,
              },
            },
          })
        );

        // keys trovate
        const foundKeys = result.Responses?.["pn-PaperTrackings"]?.map(item => item.trackingId.S) || [];
        found.push(...foundKeys);

        // keys non trovate
        const notFoundKeys = batch.filter(id => !foundKeys.includes(id));
        notFound.push(...notFoundKeys);

        // gestione eventuali UnprocessedKeys
        if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
          console.warn("UnprocessedKeys, retry batch...");
          batch = Object.keys(result.UnprocessedKeys["pn-PaperTrackings"]?.Keys || []);
          attempts++;
          await new Promise(r => setTimeout(r, 1000 * attempts)); // backoff semplice
        } else {
          success = true;
        }
        showProgress(i + batch.length, requestIds.length);
      } catch (err) {
        attempts++;
        console.error(`Errore BatchGetItem tentativo ${attempts}:`, err);
        if (attempts >= retryLimit) {
          errors.push(...batch);
        } else {
          await new Promise(r => setTimeout(r, 1000 * attempts));
        }
      }
    }
  }

  return { found, notFound, errors };
}

/**
 * Filtra gli eventi dal file JSONL e li scrive in due file distinti (FOUND, ERROR).
 * @param {string} filePath - path del file JSONL
 * @param {string[]} foundIds - lista di requestId FOUND
 * @param {string[]} errorIds - lista di requestId ERROR
 */
async function writeUnprocessedEventsByRequestIds(filePath, foundIds, errorIds) {
  const foundSet = new Set(foundIds);
  const errorSet = new Set(errorIds);

  const foundEvents = [];
  const errorEvents = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    try {
      const json = JSON.parse(line);
      const requestId = json?.analogMail?.requestId;

      if (requestId && foundSet.has(requestId)) {
        foundEvents.push(line);
      } else if (requestId && errorSet.has(requestId)) {
        errorEvents.push(line);
      }
    } catch (err) {
      console.error("Errore parsing riga JSON:", err);
    }
  }

  if (foundEvents.length > 0) {
    fs.writeFileSync(
      path.join(outDir, `FOUND_${timestamp}.jsonl`),
      foundEvents.join("\n") + "\n",
      "utf-8"
    );
  }

  if (errorEvents.length > 0) {
    fs.writeFileSync(
      path.join(outDir, `ERROR_${timestamp}.jsonl`),
      errorEvents.join("\n") + "\n",
      "utf-8"
    );
  }
}

(async () => {
  let requestIds = await extractUniqueRequestIds(inputFile);
  console.log(`Trovati ${requestIds.length} requestId unici.`);
  console.log("Aggiungo PCRETRY mancanti...");
  requestIds = fillMissingPcretries(requestIds);
  console.log("Check su Pn-PaperTrackings in corso...");
  const { found, notFound, errors } = await checkTrackingBatch(requestIds);

  // Scrivi i file di output
  await writeUnprocessedEventsByRequestIds(inputFile, found, errors);
  fs.writeFileSync(path.join(outDir, `NOT_FOUND_${timestamp}.txt`), notFound.join("\n"), "utf-8");

  console.log("=== OPERAZIONE COMPLETATA ===");
  console.log(`NOT_FOUND: ${notFound.length}`);
  console.log(`FOUND: ${found.length}`);
  console.log(`ERROR: ${errors.length}`);
})();