/*
Legge messaggi dalla coda pn-external_channel_to_paper_tracker-DLQ in batch da 1000
e li salva su out/1_readMessages/<timestamp>.jsonl

Variabili d'ambiente:
- CORE_CORE_AWS_PROFILE: profilo AWS SSO (obbligatorio)
- ACCOUNT_ID: ID account AWS (opzionale, se assente viene ricavato via STS)
- REGION: default eu-south-1
- LIMIT_MESSAGES: default 1000, massimo numero di messaggi da leggere
- DELETE_MESSAGES: se "true" cancella i messaggi letti dalla coda (default false)
- SQS_VISIBILITY_TIMEOUT: default 30, visibilità in secondi dei messaggi letti (ma non cancellati)

Output:
- out/1_readMessages/<timestamp>.jsonl (messaggi letti)
- out/1_readMessages/ERROR_<timestamp>.jsonl (messaggi non eliminati)
*/

import {
  ReceiveMessageCommand,
  DeleteMessageBatchCommand,
  SQSClient
} from "@aws-sdk/client-sqs";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromSSO } from "@aws-sdk/credential-providers";
import fs from "fs";
import path from "path";

const awsProfile = process.env.CORE_AWS_PROFILE;
const region = process.env.REGION || "eu-south-1";
const deleteMessages = process.env.DELETE_MESSAGES === "true";
const limitNumber = parseInt(process.env.LIMIT_MESSAGES || "1000", 10);
const visibilityTimeout = parseInt(process.env.SQS_VISIBILITY_TIMEOUT || "30", 10);
let accountId = process.env.ACCOUNT_ID;
const queueName = "pn-external_channel_to_paper_tracker-DLQ";

if (!awsProfile) {
  console.error("Errore: devi definire la variabile CORE_AWS_PROFILE");
  process.exit(1);
}

console.log("======= Config =======");
console.log("CORE_AWS_PROFILE:", awsProfile);
console.log("REGION:", region);
console.log("DELETE_MESSAGES:", deleteMessages);
console.log("LIMIT_MESSAGES:", limitNumber);
console.log("======================");

const credentialsProvider = fromSSO({ profile: awsProfile });

const sqsClient = new SQSClient({
  region,
  credentials: credentialsProvider,
});

const stsClient = new STSClient({
  region,
  credentials: credentialsProvider,
});

// Directory output
const outDir = path.join("out", "1_readMessages");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
const timestamp = new Date().toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const outputFile = path.join(outDir, `${timestamp}.jsonl`);
const errorFile = path.join(outDir, `ERROR_${timestamp}.jsonl`);

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
 * Legge un singolo batch di messaggi dalla coda (max 10 per limitazione SQS)
 */
async function readBatch(sqs, queueUrl, maxMessages = 10, deleteAfterRead = false) {
  const failedDeletes = [];

  const { Messages } = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: Math.min(maxMessages, 10), // SQS limit
      WaitTimeSeconds: 1,
      VisibilityTimeout: visibilityTimeout,
    })
  );

  if (!Messages || Messages.length === 0) {
    return { messages: [], failedDeletes };
  }

  if (deleteAfterRead) {
    try {
      const deleteResult = await sqs.send(
        new DeleteMessageBatchCommand({
          QueueUrl: queueUrl,
          Entries: Messages.map((msg) => ({
            Id: msg.MessageId,
            ReceiptHandle: msg.ReceiptHandle,
          })),
        })
      );

      // Gestione di eventuali failure nel batch
      if (deleteResult.Failed && deleteResult.Failed.length > 0) {
        for (const fail of deleteResult.Failed) {
          const failedMsg = Messages.find((m) => m.MessageId === fail.Id);
          failedDeletes.push({
            messageId: fail.Id,
            body: failedMsg?.Body,
            error: fail.Message,
          });
        }
      }
    } catch (err) {
      console.error("\nErrore eliminazione batch:", err);
      for (const msg of Messages) {
        failedDeletes.push({
          messageId: msg.MessageId,
          body: msg.Body,
          error: err.message,
        });
      }
    }
  }

  return { messages: Messages, failedDeletes };
}

(async () => {
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
  let totalCollected = 0;
  const allFailedDeletes = [];

  console.log("\nLettura messaggi in corso...");

  while (totalCollected < limitNumber) {
    const { messages, failedDeletes } = await readBatch(
      sqsClient,
      queueUrl,
      10, // Sempre 10 (limite SQS)
      deleteMessages
    );

    if (messages.length === 0) {
      process.stdout.write('\n');
      console.log("Nessun altro messaggio nella coda, fine.");
      break;
    }

    // Salvataggio messaggi
    const lines = messages.map(m => m.Body).join("\n") + "\n";
    fs.appendFileSync(outputFile, lines, "utf-8");

    // Accumulo errori
    allFailedDeletes.push(...failedDeletes);

    totalCollected += messages.length;
    showProgress(totalCollected, limitNumber);

    // Controllo se abbiamo raggiunto il limite
    if (totalCollected >= limitNumber) {
      console.log(`Raggiunto il limite di ${limitNumber} messaggi.`);
      break;
    }
  }

  if (allFailedDeletes.length > 0) {
    console.log(`\nScrittura file errori (${allFailedDeletes.length} falliti)`);
    const lines = allFailedDeletes.map(err => JSON.stringify(err)).join("\n") + "\n";
    fs.writeFileSync(errorFile, lines, "utf-8");
    console.log(`File errori: ${errorFile}`);
  }

  console.log("\n=== OPERAZIONE COMPLETATA ===");
  console.log(`Output file: ${outputFile}`);
  console.log(`Messaggi totali letti: ${totalCollected}`);
})();