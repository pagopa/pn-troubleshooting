/*
Crea tracking ed eventi da inviare sulla coda di pn-external_channel_to_paper_tracker
Per pcretry0 crea il tracking e eventi da inviare, per pcretryN (N>0) crea solo gli eventi

Variabili d'ambiente:
- CORE_AWS_PROFILE: profilo AWS SSO core
- CONFINFO_AWS_PROFILE: profilo AWS SSO confinfo
- INPUT_FILE: file dei requestId da processare (es. out/2_checkRequestId/NOT_FOUND_20250929102022.txt)
- REGION: default eu-south-1
- BATCH_SIZE: dimensione batch per DynamoDB (default 25, max DynamoDB limit)

Output:
- PCRETRY0_<timestamp>_init_tracking.jsonl (body chiamate a API init tracking)
- PCRETRY0_<timestamp>_intermediate_events.jsonl
- PCRETRY0_<timestamp>_final_events.jsonl
- PCRETRY<N>_<timestamp>_intermediate_events.jsonl
- PCRETRY<N>_<timestamp>_final_events.jsonl
- ERROR_<timestamp>.txt (requestId non processati in caso di errori)
*/

import { fromSSO } from "@aws-sdk/credential-providers";
import { DynamoDBClient, BatchGetItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import fs from "fs";
import path from "path";

const coreAwsProfile = process.env.CORE_AWS_PROFILE;
const confinfoAwsProfile = process.env.CONFINFO_AWS_PROFILE;
const region = process.env.REGION || "eu-south-1";
const inputFile = process.env.INPUT_FILE;
const batchSize = parseInt(process.env.BATCH_SIZE || "50", 10);

if (!coreAwsProfile || !confinfoAwsProfile || !inputFile) {
  console.error("Errore: devi definire CORE_AWS_PROFILE, CONFINFO_AWS_PROFILE e INPUT_FILE");
  process.exit(1);
}

console.log("======= Config =======");
console.log("CORE_AWS_PROFILE:", coreAwsProfile);
console.log("CONFINFO_AWS_PROFILE:", confinfoAwsProfile);
console.log("REGION:", region);
console.log("INPUT_FILE:", inputFile);
console.log("BATCH_SIZE:", batchSize);
console.log("======================");

const dynamoCore = new DynamoDBClient({
  region,
  credentials: fromSSO({ profile: coreAwsProfile }),
});

const dynamoConfinfo = new DynamoDBClient({
  region,
  credentials: fromSSO({ profile: confinfoAwsProfile }),
});

// Directory output
const outDir = path.join("out", "3_createTracking");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const timestamp = new Date().toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const errorFile = path.join(outDir, `ERROR_${timestamp}.txt`);
const CON996File = path.join(outDir, `CON996_${timestamp}.txt`);

// Cache per DeliveryDrivers (scan una volta sola all'inizio)
let deliveryDriverCache = null;

// File output per retry level
const outputFiles = {
  pcretry0: {
    initTracking: path.join(outDir, `PCRETRY0_${timestamp}_init_tracking.jsonl`),
    intermediate: path.join(outDir, `PCRETRY0_${timestamp}_intermediate_events.jsonl`),
    final: path.join(outDir, `PCRETRY0_${timestamp}_final_events.jsonl`),
  },
  pcretryN: {} // Verrà popolato dinamicamente per PCRETRY1, PCRETRY2, etc.
};

/**
 * Mostra una barra di progresso in console
 */
function showProgress(current, total, prefix = '') {
  const barLength = 40;
  const percentage = Math.min(100, Math.floor((current / total) * 100));
  const filledLength = Math.floor((barLength * current) / total);
  const emptyLength = barLength - filledLength;
  
  const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  const line = `\r${prefix}[${bar}] ${percentage}% (${current}/${total})`;
  
  process.stdout.write(line);
  
  if (current >= total) {
    process.stdout.write('\n');
  }
}

/**
 * Batch get per EcRichiesteMetadati
 */
async function batchGetEcRichiesteMetadati(requestIds) {
  const keys = requestIds.map(requestId => ({
    requestId: { S: "pn-cons-000~" + requestId }
  }));

  try {
    const result = await dynamoConfinfo.send(
      new BatchGetItemCommand({
        RequestItems: {
          "pn-EcRichiesteMetadati": {
            Keys: keys
          }
        }
      })
    );

    const items = result.Responses?.["pn-EcRichiesteMetadati"] || [];
    const itemMap = new Map();
    
    items.forEach(item => {
      const unmarshalled = unmarshall(item);
      const originalRequestId = unmarshalled.requestId.replace("pn-cons-000~", "");
      itemMap.set(originalRequestId, unmarshalled);
    });

    return itemMap;
  } catch (err) {
    console.error("\nErrore batch query pn-EcRichiesteMetadati:", err);
    throw err;
  }
}

/**
 * Batch get per PaperRequestDelivery
 */
async function batchGetPaperRequestDelivery(requestIds) {
  const keys = requestIds.map(requestId => {
    const pk = requestId.split(".PCRETRY_")[0];
    return { requestId: { S: pk } };
  });

  // Rimuovi duplicati
  const uniqueKeys = keys.filter((key, index, self) => 
    index === self.findIndex(k => k.requestId.S === key.requestId.S)
  );

  try {
    const result = await dynamoCore.send(
      new BatchGetItemCommand({
        RequestItems: {
          "pn-PaperRequestDelivery": {
            Keys: uniqueKeys
          }
        }
      })
    );

    const items = result.Responses?.["pn-PaperRequestDelivery"] || [];
    const itemMap = new Map();
    
    items.forEach(item => {
      const unmarshalled = unmarshall(item);
      itemMap.set(unmarshalled.requestId, unmarshalled);
    });

    return itemMap;
  } catch (err) {
    console.error("\nErrore batch query pn-PaperRequestDelivery:", err);
    throw err;
  }
}

/**
 * Scan completa di PaperChannelDeliveryDriver (eseguita una volta sola)
 */
async function scanAllDeliveryDrivers() {
  if (deliveryDriverCache) {
    return deliveryDriverCache;
  }

  console.log("Caricamento DeliveryDrivers (scan completa)...");
  
  try {
    const result = await dynamoCore.send(
      new ScanCommand({
        TableName: "pn-PaperChannelDeliveryDriver"
      })
    );

    const items = result.Items || [];
    deliveryDriverCache = new Map();
    
    items.forEach(item => {
      const unmarshalled = unmarshall(item);
      deliveryDriverCache.set(unmarshalled.deliveryDriverId, unmarshalled.unifiedDeliveryDriver);
    });

    console.log(`Caricati ${deliveryDriverCache.size} DeliveryDrivers\n`);
    return deliveryDriverCache;
  } catch (err) {
    console.error("\nErrore scan pn-PaperChannelDeliveryDriver:", err);
    throw err;
  }
}

/**
 * Estrae il numero di retry dal requestId (es. "xxx.PCRETRY_0" -> 0)
 */
function getRetryNumber(requestId) {
  const match = requestId.match(/\.PCRETRY_(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Verifica se uno statusCode è finale (termina con C o F)
 */
function isFinalStatus(statusCode) {
  if (!statusCode) return false;
  const lastChar = statusCode.slice(-1).toUpperCase();
  return lastChar === 'C' || lastChar === 'F';
}

/**
 * Crea il body della richiesta di init tracking
 */
function createTrackingBody(requestId, paperRequestDeliveryItem, unifiedDeliveryDriver) {
  const attemptId = requestId.split(".PCRETRY_")[0];
  const pcRetry = "PCRETRY_" + requestId.split(".PCRETRY_")[1];

  return {
    productType: paperRequestDeliveryItem.productType,
    unifiedDeliveryDriver,
    attemptId,
    pcRetry,
  };
}

/**
 * Crea il messaggio SQS per un evento
 */
function createSqsMessage(requestId, event) {
  const paperProgrStatus = event.paperProgrStatus || {};
  return {
    digitalCourtesy: null,
    digitalLegal: null,
    clientId: "pn-cons-000",
    eventTimestamp: paperProgrStatus?.clientRequestTimeStamp,
    analogMail: {
      requestId: requestId,
      registeredLetterCode: paperProgrStatus.registeredLetterCode,
      productType: paperProgrStatus.productType,
      iun: paperProgrStatus.iun,
      statusCode: paperProgrStatus.statusCode,
      statusDescription: paperProgrStatus.statusDescription,
      statusDateTime: paperProgrStatus.statusDateTime,
      deliveryFailureCause: paperProgrStatus.deliveryFailureCause || null,
      attachments: paperProgrStatus.attachments || [],
      discoveredAddress: paperProgrStatus.discoveredAddress || null,
      clientRequestTimeStamp: paperProgrStatus.clientRequestTimeStamp,
    },
  };
}

/**
 * Ottiene il path del file di output in base al retry e al tipo di evento
 */
function getOutputFilePath(retryNumber, isFinal) {
  if (retryNumber === 0) {
    return isFinal ? outputFiles.pcretry0.final : outputFiles.pcretry0.intermediate;
  }
  
  // Per PCRETRY_N (N > 0)
  if (!outputFiles.pcretryN[retryNumber]) {
    outputFiles.pcretryN[retryNumber] = {
      intermediate: path.join(outDir, `PCRETRY${retryNumber}_${timestamp}_intermediate_events.jsonl`),
      final: path.join(outDir, `PCRETRY${retryNumber}_${timestamp}_final_events.jsonl`),
    };
  }
  
  return isFinal 
    ? outputFiles.pcretryN[retryNumber].final 
    : outputFiles.pcretryN[retryNumber].intermediate;
}


/**
 * Processa un singolo requestId
 */
function processRequestId(requestId, metadatiItem, paperRequestDeliveryItem, unifiedDeliveryDriver) {
  const retryNumber = getRetryNumber(requestId);
  
  if (retryNumber === null) {
    throw new Error(`Invalid requestId format: ${requestId}`);
  }

  const results = {
    trackings: [],
    events: []
  };

  // Se è PCRETRY_0, crea il tracking
  if (retryNumber === 0) {
    const trackingBody = createTrackingBody(requestId, paperRequestDeliveryItem, unifiedDeliveryDriver);
    results.trackings.push({
      file: outputFiles.pcretry0.initTracking,
      data: trackingBody
    });
  }

  // Filtra e ordina gli eventi (decrescente per timestamp)
  const eventsToProcess = metadatiItem.eventsList
    .filter((event) => event.paperProgrStatus.statusCode && 
                        event.paperProgrStatus.statusCode !== "P000")
    .sort((a, b) => new Date(b.clientRequestTimeStamp) - new Date(a.clientRequestTimeStamp));

  // Processa ogni evento
  for (const event of eventsToProcess) {
    const sqsMessage = createSqsMessage(requestId, event);
    const isFinal = isFinalStatus(event.paperProgrStatus.statusCode);
    const outputFile = getOutputFilePath(retryNumber, isFinal);
    
    results.events.push({
      file: outputFile,
      data: sqsMessage,
      timestamp: event.clientRequestTimeStamp
    });
  }

  return results;
}

/**
 * Scrive gli output di un batch nei file JSONL
 */
function writeBatchOutputs(outputs) {
  // Raggruppa trackings per file
  const trackingsByFile = new Map();
  for (const item of outputs.trackings) {
    if (!trackingsByFile.has(item.file)) {
      trackingsByFile.set(item.file, []);
    }
    trackingsByFile.get(item.file).push(item.data);
  }

  // Scrivi trackings in batch
  for (const [file, trackings] of trackingsByFile) {
    const content = trackings.map(data => JSON.stringify(data)).join('\n') + '\n';
    fs.appendFileSync(file, content, 'utf-8');
  }

  // Ordina gli eventi per timestamp (crescente)
  const sortedEvents = outputs.events.sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  // Raggruppa eventi per file
  const eventsByFile = new Map();
  for (const item of sortedEvents) {
    if (!eventsByFile.has(item.file)) {
      eventsByFile.set(item.file, []);
    }
    eventsByFile.get(item.file).push(item.data);
  }

  // Scrivi eventi in batch
  for (const [file, events] of eventsByFile) {
    const content = events.map(data => JSON.stringify(data)).join('\n') + '\n';
    fs.appendFileSync(file, content, 'utf-8');
  }
}

/**
 * Processa un batch di requestIds e scrive immediatamente su file
 */
async function processBatch(requestIds) {
  const batchOutputs = {
    trackings: [],
    events: [],
  };
  const errors = [];

  try {
    // Batch get EcRichiesteMetadati
    const metadatiMap = await batchGetEcRichiesteMetadati(requestIds);

    // Batch get PaperRequestDelivery
    const paperRequestMap = await batchGetPaperRequestDelivery(requestIds);

    // Usa la cache dei DeliveryDrivers
    const deliveryDriverMap = deliveryDriverCache;

    // Processa ogni requestId
    for (const requestId of requestIds) {
      try {
        const metadatiItem = metadatiMap.get(requestId);
        if (!metadatiItem) {
          errors.push(requestId);
          continue;
        }

        const pk = requestId.split(".PCRETRY_")[0];
        const paperRequestDeliveryItem = paperRequestMap.get(pk);
        if (!paperRequestDeliveryItem) {
          errors.push(requestId);
          continue;
        }

        const unifiedDeliveryDriver = deliveryDriverMap.get(paperRequestDeliveryItem.driverCode);
        if (!unifiedDeliveryDriver) {
          errors.push(requestId);
          continue;
        }

        const results = processRequestId(requestId, metadatiItem, paperRequestDeliveryItem, unifiedDeliveryDriver);
        
        batchOutputs.trackings.push(...results.trackings);
        batchOutputs.events.push(...results.events);

      } catch (err) {
        errors.push(requestId);
      }
    }

  } catch (err) {
    console.error("\nErrore nel batch:", err);
    errors.push(...requestIds);
  }

  return { outputs: batchOutputs, errors };
}

/**
 * Divide un array in chunks
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

(async () => {
  try {
    // Leggi input file
    const requestIds = fs.readFileSync(inputFile, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);

    console.log(`\nProcessando ${requestIds.length} requestIds in batch da ${batchSize}...\n`);

    // Carica i DeliveryDrivers una volta sola
    await scanAllDeliveryDrivers();

    let totalTrackings = 0;
    let totalEvents = 0;
    const allErrors = [];

    // Processa in batch
    const batches = chunk(requestIds, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      showProgress(i, batches.length, 'Progresso: ');
      
      const { outputs, errors } = await processBatch(batches[i]);
      
      // Scrivi immediatamente il batch su file
      writeBatchOutputs(outputs);
      
      totalTrackings += outputs.trackings.length;
      totalEvents += outputs.events.length;
      allErrors.push(...errors);

      // Scrivi errori se presenti
      if (errors.length > 0) {
        fs.appendFileSync(errorFile, errors.join('\n') + '\n', 'utf-8');
      }

      // Salva i CON996 se presenti
      outputs.events.forEach(event => {
        if (event.data.analogMail.statusCode === 'CON996') {
          fs.appendFileSync(CON996File, event.data.analogMail.requestId + '\n', 'utf-8');
        }
      });
    }
    
    // Mostra completamento
    showProgress(batches.length, batches.length, 'Progresso: ');

    console.log(`\n=== RISULTATI FINALI ===`);
    console.log(`Processati con successo: ${requestIds.length - allErrors.length}`);
    console.log(`Trackings creati: ${totalTrackings}`);
    console.log(`Eventi processati: ${totalEvents}`);
    console.log(`Errori totali: ${allErrors.length}`);

    console.log("\nFile generati:");
    console.log(`- ${outputFiles.pcretry0.initTracking}`);
    console.log(`- ${outputFiles.pcretry0.intermediate}`);
    console.log(`- ${outputFiles.pcretry0.final}`);
    for (const [retryNum, files] of Object.entries(outputFiles.pcretryN)) {
      console.log(`- ${files.intermediate}`);
      console.log(`- ${files.final}`);
    }
    if (allErrors.length > 0) {
      console.log(`- ${errorFile}`);
    }

  } catch (err) {
    console.error("\nErrore generale:", err);
    process.exit(1);
  }
})();