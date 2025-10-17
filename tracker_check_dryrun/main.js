/*
Script per verificare la corrispondenza tra gli eventi analogici della timeline e gli output dry-run di pn-paper-tracker.

Uso:
  CORE_AWS_PROFILE=tuo_profilo REGION=eu-south-1 IUN_LIST_FILE=./iun_list.txt node main.js

Variabili d'ambiente:
  - CORE_AWS_PROFILE: profilo AWS da usare
  - REGION: regione AWS (default: eu-south-1)
  - IUN_LIST_FILE: percorso del file di testo contenente gli IUN da elaborare (default: ./iun_list.txt)

Output:
  - out/timeline_<IUN>.json: elementi della timeline letti da DynamoDB
  - out/dryrun_<IUN>.json: output dry run letti da DynamoDB
  - out/comparison_<IUN>.json: report di confronto tra timeline e dry run
*/

import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { fromSSO } from "@aws-sdk/credential-provider-sso";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import fs from "fs";

const awsProfile = process.env.CORE_AWS_PROFILE;
const region = process.env.REGION || "eu-south-1";
const iunListFile = process.env.IUN_LIST_FILE || "./iun_list.txt";

if (!awsProfile) {
  console.error("Errore: devi definire la variabile CORE_AWS_PROFILE");
  process.exit(1);
}

console.log("======= Config =======");
console.log("CORE_AWS_PROFILE:", awsProfile);
console.log("REGION:", region);
console.log("IUN_LIST_FILE:", iunListFile);
console.log("======================");

const outDir = "./out";
const dynamoClient = new DynamoDBClient({
  region,
  credentials: fromSSO({ profile: awsProfile }),
});

async function fetchTimeline(iun) {
  try {
      const baseParams = {
        TableName: "pn-Timelines",
        KeyConditionExpression: "iun = :iun AND begins_with(timelineElementId, :prefix)",
        ExpressionAttributeValues: {
          ":iun": { S: iun },
        },
      };

      // Query per SEND_ANALOG_PROGRESS
      const progressCommand = new QueryCommand({
        ...baseParams,
        ExpressionAttributeValues: {
          ...baseParams.ExpressionAttributeValues,
          ":prefix": { S: "SEND_ANALOG_PROGRESS" },
        },
      });

      // Query per SEND_ANALOG_FEEDBACK
      const feedbackCommand = new QueryCommand({
        ...baseParams,
        ExpressionAttributeValues: {
          ...baseParams.ExpressionAttributeValues,
          ":prefix": { S: "SEND_ANALOG_FEEDBACK" },
        },
      });

      // Query per SEND_SIMPLE_REGISTERED_LETTER_PROGRESS
      const rSprogressCommand = new QueryCommand({
        ...baseParams,
        ExpressionAttributeValues: {
          ...baseParams.ExpressionAttributeValues,
          ":prefix": { S: "SEND_SIMPLE_REGISTERED_LETTER_PROGRESS" },
        },
      });

      const [progressRes, feedbackRes, rSprogressRes] = await Promise.all([
        dynamoClient.send(progressCommand),
        dynamoClient.send(feedbackCommand),
        dynamoClient.send(rSprogressCommand),
      ]);

      return [...(progressRes.Items ?? []), ...(feedbackRes.Items ?? []), ...(rSprogressRes.Items ?? [])]
                        .map((item) => unmarshall(item))
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
      console.log(`Get ${trackingId}`);
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

  } while (response.Count > 0);
  return outItems;
}

function getSendRequestId(items) {
  const out = {};
  items.forEach((item) => {
    out[item.details.sendRequestId] = true;
  });
  return Object.keys(out);
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

    if (tlUri !== drUri || tl.documentType !== dr.documentType || tl.date !== dr.date) {
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

  // Mappa gli eventi dry run per deliveryDetailCode e sendRequestId
  const dryRunMap = new Map();
  dryRunElements.forEach((dr) => {
    const key = `${dr.statusDetail}`;
    if (!dryRunMap.has(key)) {
      dryRunMap.set(key, []);
    }
    dryRunMap.get(key).push(dr);
  });

  // Confronta ogni elemento della timeline
  timelineElements.forEach((tl, idx) => {
    const detailCode = tl.details?.deliveryDetailCode;
    const sendRequestId = tl.details?.sendRequestId;
    const key = `${detailCode}`;
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

      // Mappa responseStatus dalla timeline con statusCode del dry run
      let statusMatch = false;
      if (tl.category === "SEND_ANALOG_FEEDBACK") {
        const expectedStatus =
          tl.details?.responseStatus === "OK" ? "OK" : "KO";
        statusMatch = dryRun.statusCode === expectedStatus;
      } else {
        statusMatch = dryRun.statusCode === "PROGRESS";
      }

      const deliveryFailureMatch =
        (tl.details?.deliveryFailureCause || null) ===
        (dryRun.deliveryFailureCause || null);
      const detailCodeMatch =
        tl.details?.deliveryDetailCode === dryRun.statusDetail;
      const discoveredAddressMatch = true;
        //tl.details?.newAddress == null && dryRun.discoveredAddress == null;

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

        report.summary.mismatches++;
      }

      // Rimuovi l'elemento matchato
      dryRunMatches.shift();
    } else {
      report.summary.onlyInTimeline++;
    }

    report.details.push(comparison);
  });

  // Conta gli elementi rimasti solo in dry run
  dryRunMap.forEach((matches) => {
    report.summary.onlyInDryRun += matches.length;
  });

  return report;
}

async function run(iun) {
  // Esegui esempio
  const timelineElements = await fetchTimeline(iun);
  const attempts = getSendRequestId(timelineElements).map((attemptId) =>
    attemptId.replaceAll("SEND_ANALOG_DOMICILE", "PREPARE_ANALOG_DOMICILE")
  );

  const dryRunElements = [];
  for (const attemptId of attempts) {
    const outputs = await fetchDryRunOutputs(attemptId);
    dryRunElements.push(...outputs);
  }
  dryRunElements.sort((a, b) => new Date(a.created) - new Date(b.created));

  console.log(`Elementi timeline ${timelineElements.length}`);
  console.log(`Elementi dry run ${dryRunElements.length}`);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  fs.writeFileSync(
    `${outDir}/timeline_${iun}.json`,
    JSON.stringify(timelineElements, null, 2),
    "utf-8"
  );
  fs.writeFileSync(
    `${outDir}/dryrun_${iun}.json`,
    JSON.stringify(dryRunElements, null, 2),
    "utf-8"
  );

  // Esegui il confronto
  const comparisonReport = compareEvents(timelineElements, dryRunElements);
  fs.writeFileSync(
    `${outDir}/comparison_${iun}.json`,
    JSON.stringify(comparisonReport, null, 2),
    "utf-8"
  );

  console.log("\n📊 RIEPILOGO CONFRONTO:");
  console.log(`✅ Eventi corrispondenti: ${comparisonReport.summary.matched}`);
  console.log(
    `⚠️  Eventi con differenze: ${comparisonReport.summary.mismatches}`
  );
  console.log(
    `📝 Solo in Timeline: ${comparisonReport.summary.onlyInTimeline}`
  );
  console.log(`📝 Solo in DryRun: ${comparisonReport.summary.onlyInDryRun}`);

  if (comparisonReport.summary.mismatches > 0) {
    console.log("\n⚠️  DIFFERENZE TROVATE:");
    comparisonReport.details
      .filter((d) => d.status === "MISMATCH")
      .forEach((d) => {
        console.log(
          `\n  Evento #${d.index} (${d.timelineElement.deliveryDetailCode}):`
        );
        if (d.differences.date)
          console.log(`    - Data: ${d.differences.date}`);
        if (d.differences.attachments)
          console.log(`    - Allegati: ${d.differences.attachments}`);
        if (d.differences.status)
          console.log(`    - Status: ${d.differences.status}`);
      });
  }

  console.log(`\n✅ Files salvati in ${outDir}/`);
}

async function runAll() {

  if (!fs.existsSync(iunListFile)) {
    console.error(`❌ File non trovato: ${iunListFile}`);
    process.exit(1);
  }

  // Legge gli IUN, uno per riga, ignorando righe vuote
  const iunList = fs
    .readFileSync(iunListFile, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  console.log(`📄 Trovati ${iunList.length} IUN nel file:`);

  for (const iun of iunList) {
    console.log(`\n🔍 Elaboro IUN: ${iun}`);
    await run(iun);
  }

  console.log("\n✅ Tutti gli IUN elaborati.");
}

runAll();