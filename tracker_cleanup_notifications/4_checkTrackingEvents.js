/*
Controlla se pn-paper-tracker ha ricevuto correttamente gli eventi.

Per ogni evento nel file di input:
- Verifica che il relativo tracking esista in DynamoDB
- Controlla che l'evento (messageId) sia presente in tracking.events.id

Variabili d'ambiente:
- CORE_AWS_PROFILE: profilo AWS SSO core
- INPUT_FILE: file dei requestId da processare (es. input.csv)
- REGION: default eu-south-1
- BATCH_SIZE: dimensione batch per DynamoDB (default 25, max DynamoDB limit)

Output:
- ERROR_<timestamp>.jsonl (eventi mancanti o inconsistenze)
- UNPROCESSED_<timestamp>.jsonl (chiavi non processate da DynamoDB)
*/

import fs from "fs";
import path from "path";
import { fromSSO } from "@aws-sdk/credential-providers";
import { DynamoDBClient, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const coreAwsProfile = process.env.CORE_AWS_PROFILE;
const region = process.env.REGION || "eu-south-1";
const inputFile = process.env.INPUT_FILE;
const batchSize = parseInt(process.env.BATCH_SIZE || "25", 10);

if (!coreAwsProfile || !inputFile) {
  console.error("Errore: devi definire CORE_AWS_PROFILE e INPUT_FILE");
  process.exit(1);
}

console.log("======= Config =======");
console.log("CORE_AWS_PROFILE:", coreAwsProfile);
console.log("REGION:", region);
console.log("INPUT_FILE:", inputFile);
console.log("BATCH_SIZE:", batchSize);
console.log("======================");

const dynamoCore = new DynamoDBClient({
  region,
  credentials: fromSSO({ profile: coreAwsProfile }),
});

// Directory output
const outDir = path.join("out", path.basename(import.meta.url).replace(".js", ""));
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const errorFile = path.join(outDir, `ERROR_${timestamp}.jsonl`);
const unprocessedFile = path.join(outDir, `UNPROCESSED_${timestamp}.jsonl`);

/**
 * Divide un array in chunk di dimensione `size`
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Mostra una barra di progresso
 */
function showProgress(current, total, prefix = "") {
  const barLength = 40;
  const percentage = Math.min(100, Math.floor((current / total) * 100));
  const filledLength = Math.floor((barLength * current) / total);
  const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);
  const line = `\r${prefix}[${bar}] ${percentage}% (${current}/${total})`;
  process.stdout.write(line);
  if (current >= total) process.stdout.write("\n");
}

/**
 * Batch get per PaperTrackings
 */
async function batchGetPaperTrackings(trackingIds) {
  try {
    const keys = trackingIds.map((trackingId) => ({
      trackingId: { S: trackingId },
    }));

    const result = await dynamoCore.send(
      new BatchGetItemCommand({
        RequestItems: {
          "pn-PaperTrackings": {
            Keys: keys,
          },
        },
      })
    );

    const items = result.Responses?.["pn-PaperTrackings"] || [];
    const itemMap = new Map();

    items.forEach((item) => {
      const unmarshalled = unmarshall(item);
      itemMap.set(unmarshalled.trackingId, unmarshalled);
    });

    const unprocessed = result.UnprocessedKeys?.["pn-PaperTrackings"]?.Keys || [];
    return { itemMap, unprocessed };
  } catch (err) {
    console.error("\nErrore batch query pn-PaperTrackings:", err);
    throw err;
  }
}

/**
 * Scrive errori o unprocessed in file JSONL
 */
function writeErrors(filename, items) {
  if (items.length === 0) return;
  fs.appendFileSync(filename, items.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

(async () => {
  try {
    console.log("Lettura file di input...");
    const lines = fs
      .readFileSync(inputFile, "utf-8")
      .split("\n")
      .filter((line) => line.trim());

    const bodies = lines.map((line) => JSON.parse(line));

    console.log(`Trovati ${bodies.length} eventi\n`);

    if (bodies.length === 0) {
      console.log("Nessun evento da processare.");
      return;
    }

    // Raggruppa per requestId
    const requestIds = [
      ...new Set(
        bodies.map((b) => b.body?.analogMail?.requestId).filter(Boolean)
      ),
    ];

    console.log(`Trovati ${requestIds.length} requestId unici\n`);

    const chunks = chunk(requestIds, batchSize);
    const totalChunks = chunks.length;

    console.log(`Processo in ${totalChunks} batch...\n`);

    let allResults = new Map();
    let allUnprocessed = [];
    let processed = 0;

    // Recupero tracking da DynamoDB
    for (const [index, chunkIds] of chunks.entries()) {
      showProgress(index + 1, totalChunks, "Batch ");
      const { itemMap, unprocessed } = await batchGetPaperTrackings(chunkIds);
      unprocessed?.length && allUnprocessed.push(...unprocessed);
      for (const [key, value] of itemMap.entries()) {
        allResults.set(key, value);
      }
      processed += chunkIds.length;
    }

    console.log(`\nCompletato. ${processed} tracking scaricati.`);

    // Verifica eventi
    console.log("\nVerifica corrispondenza eventi...");
    const missingEvents = [];

    for (const event of bodies) {
      const reqId = event.body?.analogMail?.requestId;
      const msgId = event.messageId;

      if (!reqId || !msgId) continue;

      const tracking = allResults.get(reqId);
      if (!tracking) {
        missingEvents.push({
          type: "MISSING_TRACKING",
          requestId: reqId,
          messageId: msgId,
          reason: "Tracking non trovato in DynamoDB",
        });
        continue;
      }

      const found = tracking.events?.some((e) => e.id === msgId);
      if (!found) {
        missingEvents.push({
          type: "MISSING_EVENT",
          requestId: reqId,
          messageId: msgId,
          reason: "Evento non presente in tracking.events",
        });
      }
    }

    if (missingEvents.length > 0) {
      console.warn(`\n${missingEvents.length} eventi mancanti trovati. Scrivo su ${errorFile}`);
      writeErrors(errorFile, missingEvents);
    } else {
      console.log("✅ Tutti gli eventi trovati nei rispettivi tracking!");
    }

    if (allUnprocessed.length > 0) {
      console.warn(`\n${allUnprocessed.length} item non processati. Scrivo su ${unprocessedFile}`);
      writeErrors(unprocessedFile, allUnprocessed);
    }
  } catch (err) {
    console.error("\nErrore generale:", err);
    process.exit(1);
  }
})();
