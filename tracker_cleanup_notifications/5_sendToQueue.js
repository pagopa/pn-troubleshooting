/*
Invia eventi letti da file JSONL alla coda SQS di pn-external_channel_to_paper_tracker.

Variabili d'ambiente:
- AWS_PROFILE: profilo AWS SSO (es. core)
- REGION: default eu-south-1
- INPUT_FILE: file JSONL da inviare (es. out/3_createTracking/PCRETRY0_<timestamp>_intermediate_events.jsonl)
- BATCH_SIZE: dimensione batch locale (default 10, max 10 per SQS)
- DELAY_MS: delay tra batch in millisecondi (default 0)
- ACCOUNT_ID: ID account AWS (opzionale, se assente viene ricavato via STS)

Output:
- ERROR_<timestamp>.jsonl (dettagli errori SQS)
- UNPROCESSED_<timestamp>.jsonl (messaggi non inviati)
*/

import fs from "fs";
import path from "path";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromSSO } from "@aws-sdk/credential-providers";
import { setTimeout } from "timers/promises";

const awsProfile = process.env.CORE_AWS_PROFILE;
const region = process.env.REGION || "eu-south-1";
const inputFile = process.env.INPUT_FILE;
const batchSize = Math.min(parseInt(process.env.BATCH_SIZE || "10", 10), 10);
const delayMs = parseInt(process.env.DELAY_MS || "0", 10);
let accountId = process.env.ACCOUNT_ID;
const queueName = "pn-external_channel_to_paper_tracker";

if (!awsProfile || !inputFile) {
  console.error("Errore: devi definire CORE_AWS_PROFILE e INPUT_FILE");
  process.exit(1);
}

console.log("======= Config =======");
console.log("CORE_AWS_PROFILE:", awsProfile);
console.log("REGION:", region);
console.log("INPUT_FILE:", inputFile);
console.log("BATCH_SIZE:", batchSize);
console.log("DELAY_MS:", delayMs);
console.log("ACCOUNT_ID:", accountId);
console.log("======================\n");

const credentialsProvider = fromSSO({ profile: awsProfile });

const sqs = new SQSClient({
  region,
  credentials: credentialsProvider,
});

const stsClient = new STSClient({
  region,
  credentials: credentialsProvider,
});

// Directory output
const outDir = path.join("out", "5_sendToQueue");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const timestamp = new Date().toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const errorFile = path.join(outDir, `ERROR_${timestamp}.jsonl`);
const unprocessedFile = path.join(outDir, `UNPROCESSED_${timestamp}.jsonl`);

/**
 * Mostra una barra di progresso
 */
function showProgress(current, total, prefix = '') {
  const barLength = 40;
  const percentage = Math.min(100, Math.floor((current / total) * 100));
  const filledLength = Math.floor((barLength * current) / total);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  const line = `\r${prefix}[${bar}] ${percentage}% (${current}/${total})`;
  process.stdout.write(line);
  if (current >= total) process.stdout.write('\n');
}

/**
 * Invia un batch a SQS
 */
async function sendBatch(messages, queueUrl) {
  const entries = messages.map((msg, i) => ({
    Id: String(i),
    MessageBody: JSON.stringify(msg),
  }));

  try {
    const res = await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries,
      })
    );

    const errors = [];
    if (res.Failed && res.Failed.length > 0) {
      res.Failed.forEach(f => {
        const idx = parseInt(f.Id, 10);
        errors.push({
          body: messages[idx],
          error: f,
        });
      });
    }
    return errors;
  } catch (err) {
    return messages.map(m => ({ body: m, error: err.message }));
  }
}

/**
 * Divide array in chunks
 */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Scrive errori e unprocessed
 */
function writeErrors(errors) {
  if (errors.length === 0) return;
  fs.appendFileSync(errorFile, errors.map(e => JSON.stringify(e)).join("\n") + "\n");
  fs.appendFileSync(unprocessedFile, errors.map(e => JSON.stringify(e.body)).join("\n") + "\n");
}

(async () => {
  try {
    // Recupero accountId da env o STS
    if (!accountId) {
        console.log("ACCOUNT_ID non fornito, recupero via STS...");
        const identity = await stsClient.send(new GetCallerIdentityCommand({}));
        accountId = identity.Account;
        console.log("ACCOUNT_ID recuperato:", accountId);
    } else {
        console.log("ACCOUNT_ID:", accountId);
    }

    const queueUrl = `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;

    console.log("Lettura file...");
    const lines = fs.readFileSync(inputFile, "utf-8")
      .split("\n")
      .filter(l => l.trim());

    const messages = lines.map(l => JSON.parse(l));
    console.log(`Trovati ${messages.length} messaggi da inviare\n`);

    const batches = chunk(messages, batchSize);

    let totalSent = 0;
    let totalErrors = 0;

    for (let i = 0; i < batches.length; i++) {
      showProgress(i, batches.length, "Invio: ");
      const errors = await sendBatch(batches[i], queueUrl);
      totalSent += batches[i].length - errors.length;
      totalErrors += errors.length;
      if (errors.length > 0) writeErrors(errors);
      if (i < batches.length - 1 && delayMs > 0) await setTimeout(delayMs);
    }

    showProgress(batches.length, batches.length, "Invio: ");

    console.log(`\n=== RISULTATI FINALI ===`);
    console.log("Messaggi inviati:", totalSent);
    console.log("Errori:", totalErrors);
    if (totalErrors > 0) {
      console.log(`File errori: ${errorFile}`);
      console.log(`File unprocessed: ${unprocessedFile}`);
    }
  } catch (err) {
    console.error("\nErrore generale:", err);
    process.exit(1);
  }
})();