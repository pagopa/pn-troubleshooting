import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { fromSSO } from "@aws-sdk/credential-provider-sso";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  showProgress,
  writeFileSync,
  readAllCSVFile,
  initCSVFile,
  appendCSVRow,
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
];

const excludedStatusCodesTimeline = [];

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

/**
 * Recupera dalla tabella pn-Timelines tutti gli elementi di tipo:
 *   - SEND_ANALOG_PROGRESS
 *   - SEND_ANALOG_FEEDBACK
 *   - SEND_SIMPLE_REGISTERED_LETTER_PROGRESS
 * filtrati per IUN e, se specificato, per RECINDEX (destinatario).
 * Il risultato è ordinato per timestamp crescente.
 *
 * @param {string} iun       - Identificativo unico notifica
 * @param {string|null} recIndex - Indice destinatario (es. "1"); null = nessun filtro
 */
async function fetchTimeline(iun, recIndex) {
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
          (el.timelineElementId.startsWith("SEND_ANALOG_PROGRESS") ||
          el.timelineElementId.startsWith("SEND_ANALOG_FEEDBACK") ||
          el.timelineElementId.startsWith(
            "SEND_SIMPLE_REGISTERED_LETTER_PROGRESS"
          )) &&
          // Se recIndex è specificato, filtra per RECINDEX_N nel timelineElementId
          (recIndex == null || el.timelineElementId.includes(`RECINDEX_${recIndex}`))
      )
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } catch (err) {
    console.error("❌ Errore nella query:", err);
  }
}

/**
 * Recupera dalla tabella pn-PaperTrackerDryRunOutputs tutti gli output del dry-run
 * per un determinato attemptId, iterando da PCRETRY_0 fino a pcRetryMax-1
 * (o finché l'ultimo risultato ha ancora elementi).
 * Il risultato è ordinato per data di creazione crescente.
 *
 * @param {string} attemptId  - Parte del trackingId senza il suffisso PCRETRY (es. PREPARE_ANALOG_DOMICILE.IUN_xxx.RECINDEX_0.ATTEMPT_0)
 * @param {number} pcRetryMax - Numero minimo di PCRETRY da interrogare (es. 1 = solo PCRETRY_0)
 */
async function fetchDryRunOutputs(attemptId, pcRetryMax) {
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
  } while (response.Count > 0 || index < pcRetryMax);

  return outItems.sort((a, b) => new Date(a.created) - new Date(b.created));
}

/**
 * Recupera dalla tabella pn-PaperTrackingsErrors tutti gli errori/warning
 * associati a un determinato trackingId (es. PREPARE_ANALOG_DOMICILE.IUN_xxx.RECINDEX_0.ATTEMPT_0.PCRETRY_0).
 *
 * @param {string} trackingId - Chiave primaria completa incluso suffisso PCRETRY
 */
async function fetchAllTrackingsErrors(trackingId) {
  try {
    const command = new QueryCommand({
      TableName: "pn-PaperTrackingsErrors",
      KeyConditionExpression: "trackingId = :trackingId",
      ExpressionAttributeValues: {
        ":trackingId": { S: trackingId },
      },
    });
    const response = await dynamoClient.send(command);
    return (response.Items ?? []).map((item) => unmarshall(item));
  } catch (err) {
    console.error("❌ Errore nella query:", err);
    return [];
  }
}

/**
 * Confronta gli array di allegati tra timeline e dry-run.
 * Verifica che abbiano lo stesso numero di elementi e che per ciascuno
 * coincidano: nome file (estratto dall'URI), documentType e date.
 */
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

/**
 * Confronta un singolo elemento di timeline con un elemento dry-run.
 * Verifica: data, allegati, statusCode, deliveryFailureCause, deliveryDetailCode, discoveredAddress.
 *
 * Casi speciali:
 *  - RECRI004C: il confronto sullo statusCode è sempre positivo (la timeline riporta KO, il dry-run OK)
 *  - SEND_SIMPLE_REGISTERED_LETTER_PROGRESS: nessun confronto su statusCode
 *
 * @returns {{ status: "MATCH" } | { status: "MISMATCH", differences: object }}
 */
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
    if (tl.details?.deliveryDetailCode === "RECRI004C") {
      statusMatch = true;
    } else {
      const expectedStatus = tl.details?.responseStatus === "OK" ? "OK" : "KO";
      statusMatch = dr.statusCode === expectedStatus;
    }

    discoveredAddressMatch =
      (tl.details?.newAddress == null && dr.discoveredAddress == null) ||
      (tl.details?.newAddress != null && dr.discoveredAddress != null);
  } else if (tl.category === "SEND_SIMPLE_REGISTERED_LETTER_PROGRESS") {
    // Nothing to compare
    statusMatch = true;
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

/**
 * Confronta l'intera lista di eventi timeline con gli elementi dry-run.
 * Per ogni evento timeline cerca il miglior match in dryrun (MATCH > MISMATCH).
 * Gli elementi dry-run già usati in un MATCH vengono rimossi per evitare doppi abbinamenti.
 * Gli elementi dry-run rimasti a fine giro vengono marcati come NOT_FOUND.
 *
 * @returns {{ summary: object, details: object[] }}
 */
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

/**
 * Orchestratore per un singolo trackingId:
 *  1. Estrae recIndex e pcRetryMax dal trackingId
 *  2. Recupera gli elementi di timeline (filtrati per recIndex)
 *  3. Recupera gli output dry-run (da PCRETRY_0 fino a pcRetryMax)
 *  4. Esegue il confronto e restituisce il report
 *
 * @param {string} iun        - IUN della notifica
 * @param {string} attemptId  - trackingId senza suffisso PCRETRY
 * @param {string} trackingId - trackingId completo (usato per estrarre recIndex e pcRetryMax)
 */
async function processAttemptId(iun, attemptId, trackingId) {
  const parts = trackingId.split(".");
  const recIndexPart = parts.find((p) => p.startsWith("RECINDEX_"));
  const recIndex = recIndexPart ? recIndexPart.slice(9) : null;

  const timelineElements = (await fetchTimeline(iun, recIndex)).filter(
    (el) => excludedStatusCodesTimeline.includes(el.details?.deliveryDetailCode) === false
  );

  const pcRetryNumber = parts.find((part) => part.startsWith("PCRETRY_"));
  const pcRetryMax = pcRetryNumber ? parseInt(pcRetryNumber.split("_")[1], 10) + 1 : 1;

  const dryRunElements = (await fetchDryRunOutputs(attemptId, pcRetryMax)).filter(
    (el) => excludedStatusCodesDryRun.includes(el.statusDetail) === false
  );

  const comparisonReport = compareEvents(timelineElements, dryRunElements);

  return {
    timelineElements,
    dryRunElements,
    comparisonReport
  };
}

/**
 * Parsa un trackingId nel formato:
 *   PREPARE_ANALOG_DOMICILE.IUN_<IUN>.RECINDEX_<N>.ATTEMPT_<N>.PCRETRY_<N>
 * ed estrae:
 *  - iun: valore del segmento IUN_ (senza prefisso)
 *  - attemptId: tutto prima del segmento PCRETRY_ (usato come chiave per dry-run ed errori)
 */
function parseTrackingId(trackingId) {
  const parts = trackingId.split(".");
  const pcRetryIndex = parts.findIndex((p) => p.startsWith("PCRETRY_"));
  const attemptId = pcRetryIndex !== -1 ? parts.slice(0, pcRetryIndex).join(".") : trackingId;
  const iunPart = parts.find((p) => p.startsWith("IUN_"));
  const iun = iunPart ? iunPart.slice(4) : "";
  return { iun, attemptId };
}

/**
 * Calcola il valore della colonna matchDryRunTimeline:
 *  - "YES"               → tutti gli eventi coincidono
 *  - "NO_DRYRUN_EVENTS"  → nessun output dry-run trovato
 *  - "NO_TIMELINE_EVENTS"→ nessun evento timeline trovato
 *  - "NO"               → discrepanze rilevate
 */
function resolveMatchDryRunTimeline(comparisonReport, timelineElements, dryRunElements) {
  if (comparisonReport.summary.allMatched) return "YES";
  if (dryRunElements.length === 0) return "NO_DRYRUN_EVENTS";
  if (timelineElements.length === 0) return "NO_TIMELINE_EVENTS";
  return "NO";
}

/**
 * Waterfall di categorizzazione dell'errore per righe con matchDryRunTimeline="NO".
 *
 * Ordine di priorità:
 *
 * 1. Se matchDryRunTimeline !== "NO" → nessuna categoria (stringa vuota)
 *
 * 2. BUG_17784
 *    Il tracking è stato creato prima del 23/12/2025: il bug PN-17784 può aver
 *    causato la discrepanza. La data è il cutoff del deploy del fix.
 *
 * 3. ERROR_ON_LAST_PCRETRY
 *    La tabella pn-PaperTrackingsErrors contiene almeno un record di tipo ERROR
 *    per l'ultimo PCRETRY disponibile (si scende da MAX_PCRETRY a 0 fermandosi
 *    al primo PCRETRY che ha errori).
 *
 * 4. TIMELINE_DUPLICATED_EVENT
 *    pn-PaperTrackingsErrors contiene un WARNING con category=DUPLICATED_EVENT:
 *    SQS ha consegnato un evento duplicato che ha corrotto la timeline.
 *
 * 5. EVENT_AFTER_FINAL_EVENT
 *    pn-PaperTrackingsErrors contiene un WARNING con category=INCONSISTENT_STATE:
 *    è arrivato un evento successivo al codice finale, che non doveva essere processato.
 *
 * 6. MISSING_PCRETRY_0_DRYRUN
 *    Sono presenti output dry-run ma nessuno appartiene a PCRETRY_0: il primo
 *    tentativo non ha prodotto output, probabilmente a causa di un retry anticipato.
 *
 * 7. "" (stringa vuota) → causa non ancora classificata
 *
 * @param {object} row           - Riga CSV corrente (deve avere matchDryRunTimeline, trackingCreatedTimestamp, attemptId)
 * @param {object[]} dryRunElements - Output dry-run già filtrati per excludedStatusCodesDryRun
 */
async function resolveCategoria(row, dryRunElements) {
  // 1. Solo le righe con matchDryRunTimeline=NO richiedono categorizzazione
  if (row.matchDryRunTimeline !== "NO") return "";

  // 2. BUG_17784: tracking antecedente al deploy del fix
  if (
    row.trackingCreatedTimestamp &&
    new Date(row.trackingCreatedTimestamp) < new Date("2025-12-23T00:00:00Z")
  ) {
    return "BUG_17784";
  }

  // 3-5. Cerca errori/warning in pn-PaperTrackingsErrors partendo dall'ultimo PCRETRY
  //      e scendendo fino a PCRETRY_0; si ferma al primo PCRETRY che ha record.
  const MAX_PCRETRY = 1;
  let errors = [];
  for (let i = MAX_PCRETRY; i >= 0; i--) {
    errors.push(...await fetchAllTrackingsErrors(`${row.attemptId}.PCRETRY_${i}`));
    if (errors.length > 0) break;
  }

  // 3. ERROR_ON_LAST_PCRETRY: almeno un record di tipo ERROR
  if (errors.some((e) => e.type === "ERROR")) {
    return "ERROR_ON_LAST_PCRETRY";
  }

  // 4-5. Warning: esamina la category per distinguere il tipo di anomalia
  for (const e of errors) {
    if (e.type === "WARNING") {
      if (e.category === "DUPLICATED_EVENT") return "TIMELINE_DUPLICATED_EVENT";
      if (e.category === "INCONSISTENT_STATE") return "EVENT_AFTER_FINAL_EVENT";
    }
  }

  // 6. MISSING_PCRETRY_0_DRYRUN: ci sono dry-run outputs ma nessuno per PCRETRY_0
  const hasPcRetry0 = dryRunElements.some((el) =>
    el.trackingId?.endsWith(".PCRETRY_0")
  );
  if (!hasPcRetry0 && dryRunElements.length > 0) {
    return "MISSING_PCRETRY_0_DRYRUN";
  }

  // 7. Causa non classificata
  return "";
}

const header = [
  "trackingId",
  "trackingCreatedTimestamp",
  "productType",
  "unifiedDeliveryDriver",
  "processingMode",
  "lastStatusCode",
  "refinementState",
  "businessState",
  "ocrEnabled",
  "multipleFinalEvents",
  "matchDryRunTimeline",
  "timelineFeedback",
  "dryRunFeedback",
  "timelineElements",
  "dryRunElements",
  "categoria"
];

export async function main() {
  let lastProcessedData = null;
  const records = await readAllCSVFile(inputFile);

  // Creo la cartella di output se non esiste
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }
  initCSVFile(reportFilePath, header);

  console.log(records.length, "records to process");
  for (let i = 0; i < records.length; i++) {
    showProgress(i + 1, records.length, "Elaborazione CSV ");

    const row = records[i];
    const { iun, attemptId } = parseTrackingId(row.trackingId);
    row.IUN = iun;
    row.attemptId = attemptId;

    lastProcessedData = await processAttemptId(row.IUN, attemptId, row.trackingId);

    let { timelineElements, dryRunElements, comparisonReport } = lastProcessedData;

    row.matchDryRunTimeline = resolveMatchDryRunTimeline(comparisonReport, timelineElements, dryRunElements);

    row.categoria = await resolveCategoria(row, dryRunElements);

    // Fallback: se nessuna categoria trovata, riprova con pcRetryMax=2 per includere PCRETRY_1
    if (row.categoria === "" && row.matchDryRunTimeline === "NO") {
      const dryRunElementsV2 = (await fetchDryRunOutputs(attemptId, 2)).filter(
        (el) => !excludedStatusCodesDryRun.includes(el.statusDetail)
      );
      if (dryRunElementsV2.length > dryRunElements.length) {
        const comparisonV2 = compareEvents(timelineElements, dryRunElementsV2);
        dryRunElements = dryRunElementsV2;
        comparisonReport = comparisonV2;
        row.matchDryRunTimeline = resolveMatchDryRunTimeline(comparisonV2, timelineElements, dryRunElementsV2);
        row.categoria = await resolveCategoria(row, dryRunElements);
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
    appendCSVRow(reportFilePath, header, records[i]);
  }
  console.log(`\nFile di report salvato in ${reportFilePath}`);
}
