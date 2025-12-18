import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { fromSSO } from "@aws-sdk/credential-provider-sso";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  writeCSVFile,
  showProgress,
  writeFileSync,
  readAllCSVFile,
} from "./utils.js";
import fs from "fs";

const awsProfile = process.env.CORE_AWS_PROFILE;
const region = process.env.REGION || "eu-south-1";
const inputFile = process.env.INPUT_FILE || "./input.csv";
const saveJson = (process.env.SAVE_JSON || "false") === "true";

console.log("======= Config =======");
console.log("CORE_AWS_PROFILE:", awsProfile);
console.log("REGION:", region);
console.log("INPUT_FILE:", inputFile);
console.log("SAVE_JSON:", saveJson);
console.log("======================");

const timestamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const outDir = "./out";
const reportFilePath = `${outDir}/enriched_${inputFile.split("/").pop()}`;

// Fix for https://pagopa.atlassian.net/browse/PN-17419
const excludedStatusCodesDryRun = [
  "CON09A",
  "CON010",
  "CON011",
  "CON012",
  "CON016",
  "CON020",
];

const excludedStatusCodesTimeline = ["CON020"];

const finalStatusCodes = [
  "RECRN006",
  "RECRN013",
  "RECRN001C",
  "RECRN002C",
  "RECRN002F",
  "RECRN003C",
  "RECRN004C",
  "RECRN005C",
  "RECRI005",
  "RECRI003C",
  "RECRI004C",
  "RECAG002C",
  "RECAG003C",
  "RECAG001C",
  "RECAG003F",
  "RECAG004",
  "RECAG013",
  "RECAG005C",
  "RECAG006C",
  "RECAG007C",
  "RECAG008C",
];

const credentials = awsProfile ? fromSSO({ profile: awsProfile }) : undefined;

const dynamoClient = new DynamoDBClient({ region, credentials });

async function fetchTimeline(iun) {
  try {
    const command = new QueryCommand({
      TableName: "pn-Timelines",
      KeyConditionExpression:
        "iun = :iun AND begins_with(timelineElementId, :prefix)",
      ExpressionAttributeValues: {
        ":iun": { S: iun },
        ":prefix": { S: "SEND_" },
      },
    });

    const response = await dynamoClient.send(command);
    return (response.Items ?? [])
      .map((item) => unmarshall(item))
      .filter(
        (el) =>
          el.timelineElementId.startsWith("SEND_ANALOG_PROGRESS") ||
          el.timelineElementId.startsWith("SEND_ANALOG_FEEDBACK") ||
          el.timelineElementId.startsWith(
            "SEND_SIMPLE_REGISTERED_LETTER_PROGRESS"
          )
      )
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } catch (err) {
    console.error("❌ Errore nella query:", err);
  }
}

async function fetchDryRunOutputs(attemptId) {
  let response = {};
  let outItems = [];
  let index = 0;
  do {
    try {
      const trackingId = `${attemptId}.PCRETRY_${index}`;
      const command = new QueryCommand({
        TableName: "pn-PaperTrackerDryRunOutputs",
        KeyConditionExpression: "trackingId = :trackingId",
        ExpressionAttributeValues: {
          ":trackingId": { S: trackingId },
        },
      });

      response = await dynamoClient.send(command);

      outItems.push(...(response.Items ?? []).map((item) => unmarshall(item)));
    } catch (err) {
      console.error("❌ Errore nella query:", err);
    }
    index++;
  } while (response.Count > 0);

  return outItems.sort((a, b) => new Date(a.created) - new Date(b.created));
}

async function fetchTrackingsError(trackingId, created) {
  try {
    const command = new QueryCommand({
      TableName: "pn-PaperTrackingsErrors",
      KeyConditionExpression: "trackingId = :trackingId AND created = :created",
      ExpressionAttributeValues: {
        ":trackingId": { S: trackingId },
        ":created": { S: created },
      },
    });

    const response = await dynamoClient.send(command);
    return response.Count === 0 ? null : unmarshall(response.Items[0]);
  } catch (err) {
    console.error("❌ Errore nella query:", err);
  }
}

async function fetchTracking(trackingId) {
  try {
    const command = new QueryCommand({
      TableName: "pn-PaperTrackings",
      KeyConditionExpression: "trackingId = :trackingId",
      ExpressionAttributeValues: {
        ":trackingId": { S: trackingId },
      },
    });

    const response = await dynamoClient.send(command);
    return response.Count === 0 ? null : unmarshall(response.Items[0]);
  } catch (err) {
    console.error("❌ Errore nella query:", err);
  }
}

function compareAttachments(tlAttachments, drAttachments) {
  const tlHas = !!tlAttachments?.length;
  const drHas = !!drAttachments?.length;

  if (tlHas !== drHas) return false;
  if (!tlHas && !drHas) return true;

  // Confronta gli attachments in dettaglio
  if (tlAttachments.length !== drAttachments.length) return false;

  for (let i = 0; i < tlAttachments.length; i++) {
    const tl = tlAttachments[i];
    const dr = drAttachments[i];

    // Estrai il nome del file dall'URI
    const tlUri = tl.url?.split("/").pop() || tl.url;
    const drUri = dr.uri?.split("/").pop() || dr.uri;

    if (
      tlUri !== drUri ||
      tl.documentType !== dr.documentType ||
      tl.date !== dr.date
    ) {
      return false;
    }
  }

  return true;
}

function compareSingleEvent(tl, dr) {
  const dateMatch =
    new Date(tl.details?.notificationDate).getTime() ===
    new Date(dr.statusDateTime).getTime();

  const attachMatch = compareAttachments(
    tl.details?.attachments,
    dr.attachments
  );

  let statusMatch = false;
  let discoveredAddressMatch = true;

  if (tl.category === "SEND_ANALOG_FEEDBACK") {
    const expectedStatus = tl.details?.responseStatus === "OK" ? "OK" : "KO";
    statusMatch = dr.statusCode === expectedStatus;

    discoveredAddressMatch =
      (tl.details?.newAddress == null && dr.discoveredAddress == null) ||
      (tl.details?.newAddress != null && dr.discoveredAddress != null);
  } else {
    statusMatch = dr.statusCode === "PROGRESS";
  }

  const deliveryFailureMatch =
    (tl.details?.deliveryFailureCause || null) ===
    (dr.deliveryFailureCause || null);

  const detailCodeMatch = tl.details?.deliveryDetailCode === dr.statusDetail;

  const allMatch =
    dateMatch &&
    attachMatch &&
    statusMatch &&
    deliveryFailureMatch &&
    detailCodeMatch &&
    discoveredAddressMatch;

  if (allMatch) {
    return { status: "MATCH" };
  }

  const differences = {};

  if (!dateMatch) {
    differences.date = `Timeline: ${tl.details?.notificationDate} vs DryRun: ${dr.statusDateTime}`;
  }
  if (!attachMatch) {
    differences.attachments = `Timeline: ${JSON.stringify(
      tl.details?.attachments
    )} vs DryRun: ${JSON.stringify(dr.attachments)}`;
  }
  if (!statusMatch) {
    differences.status = `Timeline: ${tl.category}/${tl.details?.responseStatus} vs DryRun: ${dr.statusCode}`;
  }
  if (!deliveryFailureMatch) {
    differences.deliveryFailureCause = `Timeline: ${tl.details?.deliveryFailureCause} vs DryRun: ${dr.deliveryFailureCause}`;
  }
  if (!detailCodeMatch) {
    differences.deliveryDetailCode = `Timeline: ${tl.details?.deliveryDetailCode} vs DryRun: ${dr.statusDetail}`;
  }
  if (!discoveredAddressMatch) {
    differences.discoveredAddress = `Timeline: ${tl.details?.newAddress} vs DryRun: ${dr.discoveredAddress}`;
  }

  return { status: "MISMATCH", differences };
}

function compareEvents(timelineElements, dryRunElements) {
  const timeline = [...timelineElements];
  const dryrun = [...dryRunElements];

  const report = {
    summary: {
      timelineCount: timeline.length,
      dryRunCount: dryrun.length,
      matched: 0,
      onlyInTimeline: 0,
      onlyInDryRun: 0,
      allMatched: false,
      paperChannelRefined: false,
      paperTrackerRefined: false,
    },
    details: [],
  };

  let indexCounter = 1;

  for (let i = 0; i < timeline.length; i++) {
    const tl = timeline[i];
    let bestMatchIndex = -1;
    let bestResult = null;
    let bestDryRun = null;

    // Scorri TUTTI i dryRun sempre
    for (let j = 0; j < dryrun.length; j++) {
      const dr = dryrun[j];
      const result = compareSingleEvent(tl, dr);

      // Se non comparabile -> skip
      if (result.status !== "MATCH" && result.status !== "MISMATCH") {
        continue;
      }

      // Se MATCH -> massima priorità, lo prendiamo e ci fermiamo
      if (result.status === "MATCH") {
        bestMatchIndex = j;
        bestResult = result;
        bestDryRun = dr;
        break;
      }

      // Se MISMATCH -> lo prendiamo SOLO se non abbiamo nulla di meglio
      if (bestResult == null) {
        bestMatchIndex = j;
        bestResult = result;
        bestDryRun = dr;
      }
    }

    const baseTimelineElement = {
      category: tl.category,
      deliveryDetailCode: tl.details?.deliveryDetailCode,
      timestamp: tl.timestamp,
      businessTimestamp: tl.businessTimestamp,
      notificationDate: tl.details?.notificationDate,
      responseStatus: tl.details?.responseStatus,
      deliveryFailureCause: tl.details?.deliveryFailureCause,
      newAddress: tl.details?.newAddress,
      sendRequestId: tl.details?.sendRequestId,
      attachments: tl.details?.attachments?.map((a) => ({
        documentType: a.documentType,
        url: a.url,
      })),
    };

    // Nessun risultato -> NOT_FOUND
    if (bestResult == null || bestResult.status !== "MATCH") {
      report.details.push({
        index: indexCounter++,
        timelineElement: baseTimelineElement,
        dryRunElement: null,
        status: "NOT_FOUND",
      });

      report.summary.onlyInTimeline++;
      continue;
    }

    // MATCH -> aggiungi MATCH al report
    const dr = bestDryRun;

    const dryRunElement = {
      statusDetail: dr.statusDetail,
      statusCode: dr.statusCode,
      created: dr.created,
      statusDateTime: dr.statusDateTime,
      deliveryFailureCause: dr.deliveryFailureCause,
      discoveredAddress: dr.discoveredAddress,
      attachments: dr.attachments?.map((a) => ({
        documentType: a.documentType,
        uri: a.uri,
      })),
    };

    report.details.push({
      index: indexCounter++,
      timelineElement: baseTimelineElement,
      dryRunElement,
      status: "MATCH",
    });

    report.summary.matched++;

    // Rimuovi dryRun usato SOLO per MATCH
    dryrun.splice(bestMatchIndex, 1);
  }

  // Elementi rimasti in dryrun -> solo NOT_FOUND
  for (const dr of dryrun) {
    report.details.push({
      index: indexCounter++,
      timelineElement: null,
      dryRunElement: {
        statusDetail: dr.statusDetail,
        statusCode: dr.statusCode,
        created: dr.created,
        statusDateTime: dr.statusDateTime,
        deliveryFailureCause: dr.deliveryFailureCause,
        discoveredAddress: dr.discoveredAddress,
        attachments: dr.attachments?.map((a) => ({
          documentType: a.documentType,
          uri: a.uri,
        })),
      },
      status: "NOT_FOUND",
    });

    report.summary.onlyInDryRun++;
  }

  report.summary.allMatched =
    report.summary.timelineCount > 0 &&
    report.summary.onlyInTimeline === 0 &&
    report.summary.onlyInDryRun === 0;

  return report;
}

async function processAttemptId(iun, attemptId) {
  const timelineElements = (await fetchTimeline(iun)).filter(
    (el) =>
      excludedStatusCodesTimeline.includes(el.details?.deliveryDetailCode) ===
        false &&
      el.details?.sendRequestId ===
        attemptId.replaceAll("PREPARE_ANALOG_DOMICILE", "SEND_ANALOG_DOMICILE")
  );
  const dryRunElements = (await fetchDryRunOutputs(attemptId)).filter(
    (el) => excludedStatusCodesDryRun.includes(el.statusDetail) === false
  );

  const comparisonReport = compareEvents(timelineElements, dryRunElements);

  return {
    timelineElements,
    dryRunElements,
    comparisonReport,
  };
}

const header = [
  "IUN",
  "attemptId",
  "trackingId",
  "registeredLetterCode",
  "lastStatusCode",
  "finalStatusCode",
  "productType",
  "finalEventBuilderTimestamp",
  "state",
  "deliveryFailureCause",
  "unifiedDeliveryDriver",
  "ocrEnabled",
  "errorCategory",
  "errorMessage",
  "errorCause",
  "errorEventId",
  "errorEventStatusCode",
  "errorflowThrow",
  "errorType",
  "errorCreatedTimestamp",
  "multipleFinalEvents",
  "matchDryRunTimeline",
  "timelineFeedback",
  "dryRunFeedback",
  "timelineElements",
  "dryRunElements",
];

export async function main() {
  const processedAttempts = {};
  const records = await readAllCSVFile(inputFile);

  // Rimuovo il file di report precedente
  if (fs.existsSync(reportFilePath)) {
    fs.unlinkSync(reportFilePath);
  }
  // Creo la cartella di output se non esiste
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  console.log(records.length, "records to process");
  for (let i = 0; i < records.length; i++) {
    showProgress(i + 1, records.length, "Elaborazione CSV ");

    const row = records[i];
    const attemptId = row.attemptId;

    if (!processedAttempts[attemptId]) {
      processedAttempts[attemptId] = await processAttemptId(row.IUN, attemptId);
    }
    const { timelineElements, dryRunElements, comparisonReport } =
      processedAttempts[attemptId];

    if (comparisonReport.summary.allMatched) {
      row.matchDryRunTimeline = "YES";
    } else {
      if (dryRunElements.length === 0) {
        row.matchDryRunTimeline = "NO_DRYRUN_EVENTS";
      } else if (timelineElements.length === 0) {
        row.matchDryRunTimeline = "NO_TIMELINE_EVENTS";
      } else {
        row.matchDryRunTimeline = "NO";
      }
    }

    row.timelineFeedback = timelineElements
      .filter((el) => el.category === "SEND_ANALOG_FEEDBACK")
      .map((el) => el.details?.deliveryDetailCode)[0] || "NO";
    row.dryRunFeedback = dryRunElements
      .filter((el) => el.statusCode === "OK" || el.statusCode === "KO")
      .map((el) => el.statusDetail)[0]  || "NO";
    row.timelineElements = timelineElements.length;
    row.dryRunElements = dryRunElements.length;

    // Controllo quanti eventi ho ricevuto con stato finale
    if ((!row.multipleFinalEvents || row.multipleFinalEvents === "") && row.errorType !== "") {
      const tracking = await fetchTracking(row.trackingId);
      const finalEvents = tracking.events
        .filter((ev) => finalStatusCodes.includes(ev.statusCode))
        .filter((ev, index, self) => 
          index === self.findIndex((e) => e.id === ev.id)
        );
      row.multipleFinalEvents = finalEvents.length;
    }

    // Aggiorno la errorCategory se mancante
    if (row.errorType !== "" && row.errorCategory === "") {
      const trackingError = await fetchTrackingsError(
        row.trackingId,
        row.errorCreatedTimestamp
      );
      if (!trackingError) {
        console.error(
          "Unable to find tracking error for ",
          row.trackingId,
          row.errorCreatedTimestamp
        );
      } else {
        row.errorCategory = trackingError.category;
        row.errorMessage = trackingError.details?.message;
        row.errorCause = trackingError.details?.cause;
      }
    }

    // Aggiorno la registeredLetterCode se mancante
    if (row.registeredLetterCode === "") {
      row.registeredLetterCode =
        dryRunElements[dryRunElements.length - 1]?.registeredLetterCode || "";
    }

    if (saveJson) {
      if (!fs.existsSync(`${outDir}/${row.IUN}`)) {
        fs.mkdirSync(`${outDir}/${row.IUN}`);
      }

      writeFileSync(
        `${outDir}/${row.IUN}/timeline_${row.attemptId}.json`,
        timelineElements
      );
      writeFileSync(
        `${outDir}/${row.IUN}/dryrun_${row.attemptId}.json`,
        dryRunElements
      );
      writeFileSync(
        `${outDir}/${row.IUN}/comparison_${row.attemptId}.json`,
        comparisonReport
      );
    }
  }
  writeCSVFile(reportFilePath, header, records);
  console.log(`\nFile di report salvato in ${reportFilePath}`);
}
