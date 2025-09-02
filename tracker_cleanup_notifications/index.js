import { fromSSO } from "@aws-sdk/credential-providers";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import fs from "fs";

// Configurazione ENV
const coreProfile = process.env.CORE_AWS_PROFILE;
const confinfoProfile = process.env.CONFINFO_AWS_PROFILE;
const trackingHost = process.env.TRACKING_API_HOST;
const region = process.env.REGION || "eu-south-1";

if (!coreProfile || !confinfoProfile) {
  console.error(
    "Errore: devi definire le variabili CORE_AWS_PROFILE, CONFINFO_AWS_PROFILE e TRACKING_API_HOST"
  );
  process.exit(1);
}

// Parsing argomenti linea di comando
const args = process.argv.slice(2);

if (args.length < 1) {
  console.error("Uso: node index.js <paperRequestIdsFilePath>");
  process.exit(1);
}

const filePath = args[0];

const coreCredentials = fromSSO({ profile: coreProfile });
const confinfoCredentials = fromSSO({ profile: confinfoProfile });

const dynamoCore = new DynamoDBClient({ credentials: coreCredentials, region });
const dynamoConfinfo = new DynamoDBClient({
  credentials: confinfoCredentials,
  region,
});
const sqsClient = new SQSClient({ credentials: coreCredentials, region });

// Configurazione backoff
const INITIAL_DELAY = 200; // 200ms
const MAX_RETRIES = 5;
const BACKOFF_MULTIPLIER = 2;


async function getCoreAccountId() {
  try {
    const stsClient = new STSClient({ credentials: coreCredentials, region });
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    return identity.Account;
  } catch (error) {
    console.error("Errore nel recupero account ID:", error);
    throw error;
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Inviare messaggio a SQS con retry e backoff
 */
async function sendToSQSWithBackoff(message, retries = 0) {
  const accountId = await getCoreAccountId();
  const trackerQueueUrl = `https://sqs.${region}.amazonaws.com/${accountId}/pn-external_channel_to_paper_tracker`;

  try {
    const command = new SendMessageCommand({
      QueueUrl: trackerQueueUrl,
      MessageBody: JSON.stringify(message),
    });

    const result = await sqsClient.send(command);
    console.log(`Messaggio inviato a SQS: ${result.MessageId}`);
    return result;
  } catch (error) {
    if (retries < MAX_RETRIES) {
      const delayMs = INITIAL_DELAY * Math.pow(BACKOFF_MULTIPLIER, retries);
      console.warn(
        `Errore invio SQS (tentativo ${retries + 1}/${MAX_RETRIES + 1}). Retry tra ${delayMs}ms...`
      );
      await delay(delayMs);
      return sendToSQSWithBackoff(message, retries + 1);
    } else {
      console.error("Errore invio SQS dopo tutti i tentativi:", error);
      throw error;
    }
  }
}

/**
 * Verifica se il tracking esiste già
 */
async function checkTrackingExists(requestId) {
  try {
    const result = await dynamoCore.send(
      new GetItemCommand({
        TableName: "pn-PaperTrackings",
        Key: { trackingId: { S: requestId } },
      })
    );

    return result?.Item !== undefined;
  } catch (err) {
    console.error("Errore query pn-PaperTrackings:", err);
    throw err;
  }
}

/**
 * Processa un requestId con gestisce gli errori
 */
async function processRequestIdSafely(requestId) {
  try {
    // Recupera EcRichiesteMetadati
    const metadatiItem = await getEcRichiesteMetadati(requestId);
    if (!metadatiItem) {
      throw new Error("Metadati non trovati");
    }

    // Recupera dati PaperRequestDelivery
    const paperRequestDeliveryItem = await getPaperRequestDelivery(requestId);
    if (!paperRequestDeliveryItem) {
      throw new Error("PaperRequestDelivery non trovato");
    }

    // Recupera delivery driver unificato
    const unifiedDeliveryDriver = await getUnifiedDeliveryDriver(
      paperRequestDeliveryItem.driverCode
    );
    if (!unifiedDeliveryDriver) {
      throw new Error("UnifiedDeliveryDriver non trovato");
    }

    // Crea tracking
    const trackingCreated = await createTracking(
      requestId, 
      paperRequestDeliveryItem, 
      unifiedDeliveryDriver
    );
    if (!trackingCreated) {
      throw new Error("Creazione tracking fallita");
    }

    // Filtra e ordina eventi
    const eventsToProcess = metadatiItem.eventsList
      .filter((event) => event.status !== "booked" && event.status !== "sent")
      .sort((a, b) => new Date(b.clientRequestTimeStamp) - new Date(a.clientRequestTimeStamp));

    console.log(`Eventi da processare: ${eventsToProcess.length}`);

    // 6. Processa eventi uno per uno
    for (let i = 0; i < eventsToProcess.length; i++) {
      await processEvent(eventsToProcess[i], requestId, i, eventsToProcess.length);
    }

    return true;
  } catch (error) {
    throw error;
  }
}

/**
 * Recupera EcMetadati dal Confinfo
 */
async function getEcRichiesteMetadati(requestId) {
  try {
    const result = await dynamoConfinfo.send(
      new GetItemCommand({
        TableName: "pn-EcRichiesteMetadati",
        Key: { requestId: { S: "pn-cons-000~" + requestId } },
      })
    );

    if (!result?.Item) {
      console.log("RequestId EcRichiesteMetadati non esistente:", requestId);
      return null;
    }

    return unmarshall(result.Item);
  } catch (err) {
    console.error("Errore query pn-EcRichiesteMetadati:", err);
    throw err;
  }
}

/**
 * Recupera dati di PaperRequestDelivery
 */
async function getPaperRequestDelivery(requestId) {
  try {
    const pk = requestId.split(".PCRETRY_")[0];
    const result = await dynamoCore.send(
      new GetItemCommand({
        TableName: "pn-PaperRequestDelivery",
        Key: { requestId: { S: pk } },
      })
    );

    if (!result?.Item) {
      console.log("RequestId PaperRequestDelivery non esistente:", pk);
      return null;
    }

    return unmarshall(result.Item);
  } catch (err) {
    console.error("Errore query pn-PaperRequestDelivery:", err);
    throw err;
  }
}

/**
 * Recupera delivery driver unificato
 */
async function getUnifiedDeliveryDriver(driverCode) {
  try {
    const result = await dynamoCore.send(
      new GetItemCommand({
        TableName: "pn-PaperChannelDeliveryDriver",
        Key: { deliveryDriverId: { S: driverCode } },
      })
    );

    if (!result?.Item) {
      console.log(
        "deliveryDriverId PaperChannelDeliveryDriver non esistente:",
        driverCode
      );
      return null;
    }

    const deliveryDriverItem = unmarshall(result.Item);
    return deliveryDriverItem.unifiedDeliveryDriver;
  } catch (err) {
    console.error("Errore query pn-PaperChannelDeliveryDriver:", err);
    throw err;
  }
}

/**
 * Crea il tracking tramite API
 */
async function createTracking(requestId, paperRequestDeliveryItem, unifiedDeliveryDriver) {
  const attemptId = requestId.split(".PCRETRY_")[0];
  const pcRetry = "PCRETRY_" + requestId.split(".PCRETRY_")[1];
  
  const body = {
    productType: paperRequestDeliveryItem.productType,
    unifiedDeliveryDriver,
    attemptId,
    pcRetry,
  };

  try {
    const url = `${trackingHost}/paper-tracker-private/v1/init`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 201) {
      console.log("Tracking creato con successo:", requestId);
      return true;
    } else {
      let errorDetail;
      try {
        errorDetail = await res.json();
      } catch {
        errorDetail = await res.text();
      }
      console.error(`Errore creazione tracking (${res.status}):`, errorDetail);
      return false;
    }
  } catch (err) {
    console.error("Errore richiesta tracking:", err.message);
    return false;
  }
}

/**
 * Processa un singolo evento
 */
async function processEvent(event, requestId, eventIndex, totalEvents) {
  console.log(`\nProcessando evento ${eventIndex + 1}/${totalEvents} per requestId: ${requestId}`);
  
  const sqsMessage = {
    digitalCourtesy: null,
    digitalLegal: null,
    clientId: "pn-cons-000",
    eventTimestamp: event.clientRequestTimeStamp,
    analogMail: {
      requestId: requestId,
      registeredLetterCode: event.registeredLetterCode,
      productType: event.productType,
      iun: event.iun,
      statusCode: event.statusCode,
      statusDescription: event.statusDescription,
      statusDateTime: event.statusDateTime,
      deliveryFailureCause: event.deliveryFailureCause || null,
      attachments: event.attachments || [],
      discoveredAddress: event.discoveredAddress || null,
      clientRequestTimeStamp: event.clientRequestTimeStamp,
    },
  };

  await sendToSQSWithBackoff(sqsMessage);
  
  // Piccolo delay tra eventi per evitare throttling
  await delay(100);
}

/**
 * Funzione principale per processare un requestId
 */
async function processRequestId(requestId) {
  console.log(`\nInizio processamento: ${requestId}`);
  return await processRequestIdSafely(requestId);
}

/**
 * Legge il file riga per riga
 */
function* readFileLineByLine(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.length > 0) {
      yield trimmedLine;
    }
  }
}

/**
 * Salva requestId con tracking esistente
 */
function saveAlreadyExists(requestId) {
  fs.appendFileSync("already_exists.txt", `${requestId}\n`);
  console.log(`Salvato in already_exists.txt: ${requestId}`);
}

/**
 * Salva requestId con errore
 */
function saveError(requestId, error) {
  const errorMessage = `${requestId} - ${error.message || error}\n`;
  fs.appendFileSync("errors.txt", errorMessage);
  console.log(`Salvato in errors.txt: ${requestId}`);
}

/**
 * Salva requestId processato con successo
 */
function saveProcessed(requestId) {
  fs.appendFileSync("process_ok.txt", `${requestId}\n`);
  console.log(`Salvato in process_ok.txt: ${requestId}`);
}

async function main() {
  let totalProcessed = 0;
  let totalErrors = 0;
  let totalAlreadyExists = 0;
  let totalSuccess = 0;

  console.log(`Inizio processamento file: ${filePath}`);
  console.log(`File di output:`);
  console.log(` - process_ok.txt: requestId processato con successo\n`);
  console.log(` - already_exists.txt: tracking già esistenti`);
  console.log(` - errors.txt: errori durante il processamento\n`);

  try {
    // Processa il file riga per riga
    for (const requestId of readFileLineByLine(filePath)) {
      totalProcessed++;
      console.log(`\n[${totalProcessed}] Processando: ${requestId}`);
      
      try {
        // Verifica se tracking esiste già
        const trackingExists = await checkTrackingExists(requestId);
        if (trackingExists) {
          saveAlreadyExists(requestId);
          totalAlreadyExists++;
          continue;
        }

        // Processa il requestId
        const success = await processRequestIdSafely(requestId);
        if (success) {
          totalSuccess++;
          saveProcessed(requestId);
          console.log(`[${totalProcessed}] Completato con successo: ${requestId}`);
        } else {
          totalErrors++;
        }

      } catch (error) {
        console.error(`[${totalProcessed}] Errore processamento ${requestId}:`, error.message);
        saveError(requestId, error);
        totalErrors++;
      }
      
      // Delay tra requestId per evitare throttling
      await delay(10);
      
      // Log di progresso ogni 10 elementi
      if (totalProcessed % 10 === 0) {
        console.log(`\n📊 PROGRESSO - Processati: ${totalProcessed} | Successi: ${totalSuccess} | Già esistenti: ${totalAlreadyExists} | Errori: ${totalErrors}`);
      }
    }

    // Statistiche finali
    console.log(`\nSCRIPT COMPLETATO!`);
    console.log(`STATISTICHE:`);
    console.log(`   Successi: ${totalSuccess}`);
    console.log(`   Già esistenti: ${totalAlreadyExists}`);
    console.log(`   Errori: ${totalErrors}`);
    console.log(`   Totale processati: ${totalProcessed}`);
  } catch (error) {
    console.error("Errore fatale nella lettura del file:", error);
    process.exit(1);
  }
}

main();