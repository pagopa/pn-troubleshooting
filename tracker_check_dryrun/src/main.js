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
console.log("======================");

const timestamp = new Date().toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);

const outDir = "./out";
const reportFilePath = `${outDir}/report_${timestamp}.csv`;

const dynamoClient = new DynamoDBClient({
  region,
  credentials: fromSSO({ profile: awsProfile }),
});

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
  } while (numPcRetry !== null ? index < numPcRetry : response.Count > 0);

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

function compareEvents(timelineElements, dryRunElements) {
  const report = {
    summary: {
      timelineCount: timelineElements.length,
      dryRunCount: dryRunElements.length,
      matched: 0,
      mismatches: 0,
      onlyInTimeline: 0,
      onlyInDryRun: 0,
    },
    details: [],
  };

  // Mappa gli eventi dry run per deliveryDetailCode
  const dryRunMap = new Map();
  dryRunElements.forEach((dr) => {
    const key = `${dr.statusDetail}#${
      dr.attachments?.map((a) => a.id)[0] || ""
    }`;
    if (!dryRunMap.has(key)) {
      dryRunMap.set(key, []);
    }
    dryRunMap.get(key).push(dr);
  });

  // Confronta ogni elemento della timeline
  timelineElements.forEach((tl, idx) => {
    const detailCode = tl.details?.deliveryDetailCode;
    const sendRequestId = tl.details?.sendRequestId;
    const key = `${detailCode}#${
      tl.details?.attachments?.map((a) => a.id)[0] || ""
    }`;
    const dryRunMatches = dryRunMap.get(key) || [];

    const comparison = {
      index: idx + 1,
      timelineElement: {
        category: tl.category,
        deliveryDetailCode: detailCode,
        timestamp: tl.timestamp,
        businessTimestamp: tl.businessTimestamp,
        notificationDate: tl.details?.notificationDate,
        responseStatus: tl.details?.responseStatus,
        deliveryFailureCause: tl.details?.deliveryFailureCause,
        newAddress: tl.details?.newAddress,
        sendRequestId: sendRequestId,
        attachments: tl.details?.attachments?.map((a) => ({
          documentType: a.documentType,
          url: a.url,
        })),
      },
      dryRunElement: null,
      status: "NOT_FOUND",
    };

    if (dryRunMatches.length > 0) {
      const dryRun = dryRunMatches[0];
      comparison.dryRunElement = {
        statusDetail: dryRun.statusDetail,
        statusCode: dryRun.statusCode,
        created: dryRun.created,
        statusDateTime: dryRun.statusDateTime,
        deliveryFailureCause: dryRun.deliveryFailureCause,
        discoveredAddress: dryRun.discoveredAddress,
        attachments: dryRun.attachments?.map((a) => ({
          documentType: a.documentType,
          uri: a.uri,
        })),
      };

      // Verifica corrispondenza completa
      const dateMatch = tl.details?.notificationDate === dryRun.statusDateTime;
      const attachMatch = compareAttachments(
        tl.details?.attachments,
        dryRun.attachments
      );

      let statusMatch = false;
      let discoveredAddressMatch = true;
      if (tl.category === "SEND_ANALOG_FEEDBACK") {
        const expectedStatus =
          tl.details?.responseStatus === "OK" ? "OK" : "KO";
        statusMatch = dryRun.statusCode === expectedStatus;

        discoveredAddressMatch =
          (tl.details?.newAddress == null &&
            dryRun.discoveredAddress == null) ||
          (tl.details?.newAddress != null && dryRun.discoveredAddress != null);
      } else {
        statusMatch = dryRun.statusCode === "PROGRESS";
      }

      const deliveryFailureMatch =
        (tl.details?.deliveryFailureCause || null) ===
        (dryRun.deliveryFailureCause || null);
      const detailCodeMatch =
        tl.details?.deliveryDetailCode === dryRun.statusDetail;

      if (
        dateMatch &&
        attachMatch &&
        statusMatch &&
        deliveryFailureMatch &&
        detailCodeMatch &&
        discoveredAddressMatch
      ) {
        comparison.status = "MATCH";
        report.summary.matched++;
      } else {
        comparison.status = "MISMATCH";
        comparison.differences = {};

        if (!dateMatch) {
          comparison.differences.date = `Timeline: ${tl.details?.notificationDate} vs DryRun: ${dryRun.statusDateTime}`;
        }
        if (!attachMatch) {
          comparison.differences.attachments = `Timeline: ${JSON.stringify(
            tl.details?.attachments
          )} vs DryRun: ${JSON.stringify(dryRun.attachments)}`;
        }
        if (!statusMatch) {
          comparison.differences.status = `Timeline: ${tl.category}/${tl.details?.responseStatus} vs DryRun: ${dryRun.statusCode}`;
        }
        if (!deliveryFailureMatch) {
          comparison.differences.deliveryFailureCause = `Timeline: ${tl.details?.deliveryFailureCause} vs DryRun: ${dryRun.deliveryFailureCause}`;
        }
        if (!detailCodeMatch) {
          comparison.differences.deliveryDetailCode = `Timeline: ${tl.details?.deliveryDetailCode} vs DryRun: ${dryRun.statusDetail}`;
        }
        if (!discoveredAddressMatch) {
          comparison.differences.discoveredAddress = `Timeline: ${tl.details?.newAddress} vs DryRun: ${dryRun.discoveredAddress}`;
        }
        report.summary.mismatches++;
      }

      // Rimuovi l'elemento matchato
      dryRunMatches.shift();
    } else {
      report.summary.onlyInTimeline++;
    }

    report.details.push(comparison);
  });

  // Aggiungi gli elementi rimasti solo in dry run
  dryRunMap.forEach((matches) => {
    matches.forEach((dr) => {
      report.details.push({
        index: report.details.length + 1,
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
    });
  });

  return report;
}

async function processAttemptId(iun, attemptId, numPcRetry = null) {
  const timelineElements = await fetchTimeline(iun, attemptId);
  const dryRunElements = await fetchDryRunOutputs(attemptId, numPcRetry);
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
        match:
          comparisonReport.summary.timelineCount !== 0 &&
          comparisonReport.summary.mismatches === 0 &&
          comparisonReport.summary.onlyInTimeline === 0 &&
          comparisonReport.summary.onlyInDryRun === 0
            ? "YES"
            : "NO",
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
        match:
          comparisonReport.summary.timelineCount !== 0 &&
          comparisonReport.summary.mismatches === 0 &&
          comparisonReport.summary.onlyInTimeline === 0 &&
          comparisonReport.summary.onlyInDryRun === 0
            ? "YES"
            : "NO",
      });
    }

    if (saveJson) {
      writeFileSync(
        `${outDir}/timeline_${record.attemptId}.json`,
        timelineElements
      );
      writeFileSync(
        `${outDir}/dryrun_${record.attemptId}.json`,
        dryRunElements
      );
      writeFileSync(
        `${outDir}/trackingErrors_${record.attemptId}.json`,
        trackingErrors
      );
      writeFileSync(
        `${outDir}/comparison_${record.attemptId}.json`,
        comparisonReport
      );
    }
  }
  console.log(`\nFiles salvati in ${outDir}/`);
}
