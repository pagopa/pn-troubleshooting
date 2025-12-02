import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { fromSSO } from "@aws-sdk/credential-provider-sso";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { readCSVFile, appendCSVRow, showProgress, writeFileSync } from "./utils.js";
import fs from "fs";

const awsProfile = process.env.CORE_AWS_PROFILE;
const region = process.env.REGION || "eu-south-1";
const inputFile = process.env.INPUT_FILE || "./input.csv";
const saveJson = (process.env.SAVE_JSON || "false") === "true";

if (!awsProfile) {
  console.error("Errore: devi definire la variabile CORE_AWS_PROFILE");
  process.exit(1);
}

console.log("======= Config =======");
console.log("CORE_AWS_PROFILE:", awsProfile);
console.log("REGION:", region);
console.log("INPUT_FILE:", inputFile);
console.log("SAVE_JSON:", saveJson);
console.log("======================");

const timestamp = new Date().toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const outDir = "./out";
const reportFilePath = `${outDir}/report_${timestamp}.csv`;

// Fix for https://pagopa.atlassian.net/browse/PN-17419
const excludedStatusCodesDryRun = [
  "CON09A", "CON010", "CON011", "CON012", "CON016", "CON020"
]

const excludedStatusCodesTimeline = [
  "CON020"
]

const credentials = awsProfile
  ? fromSSO({ profile: awsProfile })
  : undefined;

const dynamoClient = new DynamoDBClient({ region, credentials });

async function fetchTimeline(iun, attemptId) {
  const skProgress = attemptId.replaceAll(
    "PREPARE_ANALOG_DOMICILE",
    "SEND_ANALOG_PROGRESS"
  );
  const skFeedback = attemptId.replaceAll(
    "PREPARE_ANALOG_DOMICILE",
    "SEND_ANALOG_FEEDBACK"
  );
  const skRSProgress = attemptId.replaceAll(
    "PREPARE_ANALOG_DOMICILE",
    "SEND_SIMPLE_REGISTERED_LETTER_PROGRESS"
  );
  try {
    const baseParams = {
      TableName: "pn-Timelines",
      KeyConditionExpression:
        "iun = :iun AND begins_with(timelineElementId, :prefix)",
      ExpressionAttributeValues: {
        ":iun": { S: iun },
      },
    };

    // Query per SEND_ANALOG_PROGRESS
    const progressCommand = new QueryCommand({
      ...baseParams,
      ExpressionAttributeValues: {
        ...baseParams.ExpressionAttributeValues,
        ":prefix": { S: skProgress },
      },
    });

    // Query per SEND_ANALOG_FEEDBACK
    const feedbackCommand = new QueryCommand({
      ...baseParams,
      ExpressionAttributeValues: {
        ...baseParams.ExpressionAttributeValues,
        ":prefix": { S: skFeedback },
      },
    });

    // Query per SEND_SIMPLE_REGISTERED_LETTER_PROGRESS
    const rSprogressCommand = new QueryCommand({
      ...baseParams,
      ExpressionAttributeValues: {
        ...baseParams.ExpressionAttributeValues,
        ":prefix": { S: skRSProgress },
      },
    });

    const [progressRes, feedbackRes, rSprogressRes] = await Promise.all([
      dynamoClient.send(progressCommand),
      dynamoClient.send(feedbackCommand),
      dynamoClient.send(rSprogressCommand),
    ]);

    return [
      ...(progressRes.Items ?? []),
      ...(feedbackRes.Items ?? []),
      ...(rSprogressRes.Items ?? []),
    ]
      .map((item) => unmarshall(item))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } catch (err) {
    console.error("❌ Errore nella query:", err);
  }
}

async function fetchDryRunOutputs(attemptId, numPcRetry = null) {
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

      outItems.push(...(response.Items || []).map((item) => unmarshall(item)));
    } catch (err) {
      console.error("❌ Errore nella query:", err);
    }
    index++;
  } while (numPcRetry !== null ? index <= numPcRetry : response.Count > 0);

  return outItems;
}

async function fetchTrackingsErrors(attemptId, numPcRetry = null) {
  let response = {};
  let outItems = [];
  let index = 0;
  do {
    try {
      const trackingId = `${attemptId}.PCRETRY_${index}`;
      const command = new QueryCommand({
        TableName: "pn-PaperTrackingsErrors",
        KeyConditionExpression: "trackingId = :trackingId",
        ExpressionAttributeValues: {
          ":trackingId": { S: trackingId },
        },
      });

      response = await dynamoClient.send(command);

      outItems.push(...(response.Items || []).map((item) => unmarshall(item)));
    } catch (err) {
      console.error("❌ Errore nella query:", err);
    }
    index++;
  } while (numPcRetry !== null ? index < numPcRetry : response.Count > 0);

  return outItems;
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

  const detailCodeMatch =
    tl.details?.deliveryDetailCode === dr.statusDetail;

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
  const timeline = [...timelineElements]; // copia array
  const dryrun = [...dryRunElements];

  const report = {
    summary: {
      timelineCount: timeline.length,
      dryRunCount: dryrun.length,
      matched: 0,
      onlyInTimeline: 0,
      onlyInDryRun: 0,
      allMatched: false,
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

      // Se non comparabile → skip
      if (result.status !== "MATCH" && result.status !== "MISMATCH") {
        continue;
      }

      // Se MATCH → massima priorità, lo prendiamo e ci fermiamo
      if (result.status === "MATCH") {
        bestMatchIndex = j;
        bestResult = result;
        bestDryRun = dr;
        break;
      }

      // Se MISMATCH → lo prendiamo SOLO se non abbiamo nulla di meglio
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

    // Nessun risultato → NOT_FOUND
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

    // MATCH → aggiungi MATCH al report
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

  // Elementi rimasti in dryrun → solo NOT_FOUND
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

async function processAttemptId(iun, attemptId, numPcRetry = null) {
  const timelineElements = (await fetchTimeline(iun, attemptId)).filter(
    (el) => excludedStatusCodesTimeline.includes(el.details?.deliveryDetailCode) === false
  );
  const dryRunElements = (await fetchDryRunOutputs(attemptId, numPcRetry)).filter(
    (el) => excludedStatusCodesDryRun.includes(el.statusDetail) === false
  );

  const trackingErrors = await fetchTrackingsErrors(attemptId, numPcRetry);
  const comparisonReport = compareEvents(timelineElements, dryRunElements);

  return {
    timelineElements,
    dryRunElements,
    trackingErrors,
    comparisonReport,
  };
}

// reportSummaryFilePath

export async function main() {
  const records = await readCSVFile(inputFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }
  const header = [
    "attemptId",
    "requestId",
    "iun",
    "registeredLetterCode",
    "match",
    "errorCategory",
    "errorCause",
    "errorDescription",
    "errorEventFlowThrow",
    "errorFlowThrow",
    "errorType",
  ];

  for (let i=0; i < records.length; i++) {
    showProgress(i+1, records.length, 'Elaborazione CSV ');
    const record = records[i];
    const {
      timelineElements,
      dryRunElements,
      trackingErrors,
      comparisonReport,
    } = await processAttemptId(record.iun, record.attemptId, record.numPcRetry);

    for (const te of trackingErrors) {
      appendCSVRow(reportFilePath, header, {
        requestId: te.trackingId,
        attemptId: record.attemptId,
        iun: record.iun,
        registeredLetterCode: record.registeredLetterCode,
        match: comparisonReport.summary.allMatched ? "YES" : "NO",
        errorCategory: te.category || "",
        errorCause: te.errorCause || "",
        errorDescription: te.details.message || "",
        errorEventFlowThrow: te.eventThrow || "",
        errorFlowThrow: te.flowThrow || "",
        errorType: te.type || "",
      });
    }
    if (trackingErrors.length === 0) {
      appendCSVRow(reportFilePath, header, {
        requestId: record.attemptId + ".PCRETRY_" + record.numPcRetry,
        attemptId: record.attemptId,
        iun: record.iun,
        registeredLetterCode: record.registeredLetterCode,
        match: comparisonReport.summary.allMatched ? "YES" : "NO",
      });
    }

    if (saveJson) {
      if (!fs.existsSync(`${outDir}/${record.iun}`)) {
        fs.mkdirSync(`${outDir}/${record.iun}`);
      }

      writeFileSync(
        `${outDir}/${record.iun}/timeline_${record.attemptId}.json`,
        timelineElements
      );
      writeFileSync(
        `${outDir}/${record.iun}/dryrun_${record.attemptId}.json`,
        dryRunElements
      );
      writeFileSync(
        `${outDir}/${record.iun}/trackingErrors_${record.attemptId}.json`,
        trackingErrors
      );
      writeFileSync(
        `${outDir}/${record.iun}/comparison_${record.attemptId}.json`,
        comparisonReport
      );
    }
  }
  console.log(`\nFiles salvati in ${outDir}/`);
}
