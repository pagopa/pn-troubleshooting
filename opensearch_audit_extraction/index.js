const path = require("path");
const readline = require("readline");
const ExcelJS = require("exceljs");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const AWS_PROFILE = process.argv[2];
if (AWS_PROFILE) {
  process.env.AWS_PROFILE = AWS_PROFILE;
}

const BASE_URL = process.env.BASE_URL;
const OPENSEARCH_INDEX_PATTERN = process.env.OPENSEARCH_INDEX_PATTERN || "pn-logs*";
const LOG_GROUP_FIELD = process.env.LOG_GROUP_FIELD || "logGroup";
const MESSAGE_FIELD = process.env.MESSAGE_FIELD || "message";
const USERNAME = process.env.USERNAME;
const OPENSEARCH_TIMEOUT_MS = Number(process.env.OPENSEARCH_TIMEOUT_MS || 120000);
let runtimePassword = "";

if (!BASE_URL) {
  console.error("Missing BASE_URL in .env");
  process.exit(1);
}

const rejectUnauthorized = process.env.AGENT !== "false";

// Range temporale: dal 16 23:59:59 del mese precedente al 17 00:00:00 del mese corrente.
const now = new Date();
const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 16, 23, 59, 59, 0));
//const startDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 16, 0, 0, 0, 0));
const endDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 17, 0, 0, 0, 0));

const outputBaseName = `Report_KPI_OpenSearch-${sanitizeDate(startDate)}-${sanitizeDate(endDate)}`;

function sanitizeDate(date) {
  return date.toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z");
}

function baseFilters(logGroupName) {
  return [
    { term: { [LOG_GROUP_FIELD]: logGroupName } },
    { range: { "@timestamp": { gte: startDate.toISOString(), lt: endDate.toISOString() } } },
  ];
}

function containsRegex(value) {
  return { regexp: { [MESSAGE_FIELD]: `.*${value}.*` } };
}

function askHiddenInput(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.stdoutMuted = true;
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (!rl.stdoutMuted) {
        rl.output.write(stringToWrite);
      }
    };

    rl.question(promptText, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function prepareAuth() {
  if (!USERNAME) {
    return;
  }

  console.log("Autenticazione Basic attiva: inserire la password OpenSearch...");
  runtimePassword = await askHiddenInput("Inserisci la password OpenSearch: ");
  if (!runtimePassword) {
    throw new Error("Password non fornita: autenticazione Basic non possibile.");
  }
}

async function search(body) {
  const url = `${BASE_URL}/${OPENSEARCH_INDEX_PATTERN}/_search`;
  const headers = {
    "Content-Type": "application/json",
  };

  if (USERNAME && runtimePassword) {
    headers.Authorization = `Basic ${Buffer.from(`${USERNAME}:${runtimePassword}`).toString("base64")}`;
  }

  // fetch in Node uses undici; for local tunnel with self-signed certs keep parity with prior behavior.
  if (!rejectUnauthorized) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OPENSEARCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

function sanitizeSheetName(name) {
  return name.replace(/[\\/\?\*\[\]:]/g, " ").slice(0, 31);
}

function isNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }
  return !Number.isNaN(Number(value));
}

async function kpi1AccessiGenerali() {
  const body = {
    size: 0,
    query: {
      bool: {
        filter: [
          ...baseFilters("/aws/ecs/pn-delivery"),
          { term: { source_channel: "IO" } },
          { term: { source_channel_details: "QR_CODE" } },
          { term: { level: "INFO" } },
          { regexp: { aud_type: "AUD_NT_VIEW.*" } },
        ],
        must_not: [containsRegex("BEFORE")],
      },
    },
    aggs: {
      TipoAccesso: {
        terms: {
          script: {
            lang: "painless",
            source: "return (doc.containsKey('mandate_workflow_type') && !doc['mandate_workflow_type'].empty) ? doc['mandate_workflow_type'].value : 'DIRETTO';",
          },
          size: 100,
          order: { _count: "desc" },
        },
      },
    },
  };

  const result = await search(body);
  return (result.aggregations?.TipoAccesso?.buckets || []).map((b) => ({
    TipoAccesso: b.key,
    Accessi: b.doc_count,
  }));
}

async function kpi1DelegatiRipetuti() {
  const body = {
    size: 0,
    query: {
      bool: {
        filter: [
          ...baseFilters("/aws/ecs/pn-delivery"),
          { term: { source_channel: "IO" } },
          { term: { source_channel_details: "QR_CODE" } },
          { term: { aud_type: "AUD_NT_VIEW_DEL" } },
          { term: { mandate_workflow_type: "CIE" } },
          { term: { level: "INFO" } },
          containsRegex("SUCCESS"),
        ],
      },
    },
    aggs: {
      Delegato: {
        terms: { field: "cx_id", size: 10000, order: { _count: "desc" } },
        aggs: {
          gt_10: {
            bucket_selector: {
              buckets_path: { c: "_count" },
              script: "params.c > 10",
            },
          },
          top_50: {
            bucket_sort: {
              sort: [{ _count: { order: "desc" } }],
              size: 50,
            },
          },
        },
      },
    },
  };

  const result = await search(body);
  return (result.aggregations?.Delegato?.buckets || []).map((b) => ({
    Delegato: b.key,
    Accessi: b.doc_count,
  }));
}

async function kpi2TassoSuccesso() {
  const body = {
    size: 0,
    query: {
      bool: {
        filter: [
          ...baseFilters("/aws/ecs/pn-mandate"),
          { term: { source_channel: "IO" } },
          { term: { aud_type: "AUD_DL_ACCEPT" } },
          { term: { mandate_workflow_type: "CIE" } },
        ],
        must_not: [containsRegex("BEFORE")],
      },
    },
    aggs: {
      by_workflow: {
        terms: { field: "mandate_workflow_type", size: 10 },
        aggs: {
          Esito: {
            terms: {
              script: {
                lang: "painless",
                source: "def l = doc.containsKey('level') && !doc['level'].empty ? doc['level'].value : 'UNKNOWN'; if (l == 'INFO') return 'SUCCESS'; if (l == 'ERROR') return 'FAIL'; return l;",
              },
              size: 10,
              order: { _key: "desc" },
            },
          },
        },
      },
    },
  };

  const result = await search(body);
  const rows = [];
  for (const w of result.aggregations?.by_workflow?.buckets || []) {
    for (const e of w.Esito?.buckets || []) {
      rows.push({
        mandate_workflow_type: w.key,
        Esito: e.key,
        Numero: e.doc_count,
      });
    }
  }

  rows.sort((a, b) => String(b.Esito).localeCompare(String(a.Esito)));
  return rows;
}

async function kpi3DistribuzioneDeleghe() {
  const body = {
    size: 0,
    query: {
      bool: {
        filter: [
          ...baseFilters("/aws/ecs/pn-mandate"),
          { term: { source_channel: "IO" } },
          { term: { aud_type: "AUD_DL_ACCEPT" } },
          { term: { mandate_workflow_type: "CIE" } },
          { term: { level: "INFO" } },
        ],
        must_not: [containsRegex("BEFORE")],
      },
    },
    aggs: {
      combo: {
        composite: {
          size: 2000,
          sources: [
            { Delegato: { terms: { field: "cx_id" } } },
            { Delegante: { terms: { field: "delegator_id" } } },
          ],
        },
      },
    },
  };

  const rows = [];
  let after;
  do {
    if (after) {
      body.aggs.combo.composite.after = after;
    } else {
      delete body.aggs.combo.composite.after;
    }

    const result = await search(body);
    const buckets = result.aggregations?.combo?.buckets || [];
    for (const b of buckets) {
      if (b.doc_count > 10) {
        rows.push({
          Delegato: b.key.Delegato,
          Delegante: b.key.Delegante,
          Numero: b.doc_count,
        });
      }
    }
    after = result.aggregations?.combo?.after_key;
  } while (after);

  rows.sort((a, b) => b.Numero - a.Numero);
  return rows.slice(0, 50);
}

async function kpi3SospettoFallimenti() {
  const body = {
    size: 0,
    query: {
      bool: {
        filter: [
          ...baseFilters("/aws/ecs/pn-mandate"),
          { term: { source_channel: "IO" } },
          { term: { aud_type: "AUD_DL_ACCEPT" } },
          { term: { mandate_workflow_type: "CIE" } },
          { term: { level: "ERROR" } },
        ],
        must_not: [containsRegex("BEFORE")],
      },
    },
    aggs: {
      Delegato: {
        terms: { field: "cx_id", size: 10000, order: { _count: "desc" } },
        aggs: {
          gt_10: {
            bucket_selector: {
              buckets_path: { c: "_count" },
              script: "params.c > 10",
            },
          },
          top_50: {
            bucket_sort: {
              sort: [{ _count: { order: "desc" } }],
              size: 50,
            },
          },
        },
      },
    },
  };

  const result = await search(body);
  return (result.aggregations?.Delegato?.buckets || []).map((b) => ({
    Delegato: b.key,
    Fallimenti: b.doc_count,
  }));
}

async function kpi3SospettoPerSoggetto() {
  const body = {
    size: 0,
    query: {
      bool: {
        filter: [
          ...baseFilters("/aws/ecs/pn-mandate"),
          { term: { source_channel: "IO" } },
          { term: { aud_type: "AUD_DL_ACCEPT" } },
          { term: { mandate_workflow_type: "CIE" } },
          { term: { level: "INFO" } },
          containsRegex("SUCCESS"),
        ],
      },
    },
    aggs: {
      Delegato: {
        terms: { field: "cx_id", size: 10000, order: { _count: "desc" } },
        aggs: {
          gt_10: {
            bucket_selector: {
              buckets_path: { c: "_count" },
              script: "params.c > 10",
            },
          },
          top_50: {
            bucket_sort: {
              sort: [{ _count: { order: "desc" } }],
              size: 50,
            },
          },
        },
      },
    },
  };

  const result = await search(body);
  return (result.aggregations?.Delegato?.buckets || []).map((b) => ({
    Delegato: b.key,
    Accessi: b.doc_count,
  }));
}

async function kpi6ErroriValidazione() {
  const body = {
    size: 0,
    query: {
      bool: {
        filter: [
          ...baseFilters("/aws/ecs/pn-mandate"),
          { term: { source_channel: "IO" } },
          { term: { aud_type: "AUD_DL_ACCEPT" } },
          { term: { mandate_workflow_type: "CIE" } },
          { term: { level: "ERROR" } },
        ],
      },
    },
    aggs: {
      CategoriaDiErrore: {
        terms: { field: "error_category", size: 1000, order: { _count: "desc" } },
      },
    },
  };

  const result = await search(body);
  return (result.aggregations?.CategoriaDiErrore?.buckets || []).map((b) => ({
    CategoriaDiErrore: b.key,
    NumeroErrori: b.doc_count,
  }));
}

async function topDelegati() {
  const body = {
    size: 0,
    query: {
      bool: {
        filter: [
          ...baseFilters("/aws/ecs/pn-mandate"),
          { term: { source_channel: "IO" } },
          { term: { aud_type: "AUD_DL_ACCEPT" } },
          { term: { mandate_workflow_type: "CIE" } },
          { term: { level: "INFO" } },
        ],
        must_not: [containsRegex("BEFORE")],
      },
    },
    aggs: {
      Delegato: {
        terms: { field: "cx_id", size: 10000 },
        aggs: {
          DelegantiUnici: { cardinality: { field: "delegator_id" } },
          IUNUnici: { cardinality: { field: "iun" } },
          sort_limit: {
            bucket_sort: {
              sort: [{ DelegantiUnici: { order: "desc" } }],
              size: 10,
            },
          },
        },
      },
    },
  };

  const result = await search(body);
  return (result.aggregations?.Delegato?.buckets || []).map((b) => ({
    Delegato: b.key,
    DelegantiUnici: Math.round(b.DelegantiUnici?.value || 0),
    IUNUnici: Math.round(b.IUNUnici?.value || 0),
  }));
}

const kpiConfigs = [
  { sheetName: "KP1 - Accessi Generali", fn: kpi1AccessiGenerali },
  { sheetName: "KP1 - Delegati Ripetuti", fn: kpi1DelegatiRipetuti },
  { sheetName: "KP2 - Tasso Successo", fn: kpi2TassoSuccesso },
  { sheetName: "KP3 - Distribuzione Deleghe", fn: kpi3DistribuzioneDeleghe },
  { sheetName: "KP3 - Sospetto Fallimenti", fn: kpi3SospettoFallimenti },
  { sheetName: "KP3 - Sospetto per Soggetto", fn: kpi3SospettoPerSoggetto },
  { sheetName: "KP6 - Errori Validazione", fn: kpi6ErroriValidazione },
  { sheetName: "Top Delegati", fn: topDelegati },
];

async function runPipeline() {
  console.log("Avvio pipeline OpenSearch (HTTP) -> Excel...");
  console.log(`Intervallo UTC: ${startDate.toISOString()} -> ${endDate.toISOString()}`);
  console.log(`Endpoint: ${BASE_URL}`);
  console.log(`Indice: ${OPENSEARCH_INDEX_PATTERN}`);

  const outputDir = process.cwd();
  const outputFile = path.join(outputDir, `${outputBaseName}.xlsx`);
  const workbook = new ExcelJS.Workbook();

  let processedSheetsCount = 0;

  for (const kpi of kpiConfigs) {
    console.log("\n--------------------------------------------------");
    console.log(`Eseguo KPI: [ ${kpi.sheetName} ]`);
    try {
      const rows = await kpi.fn();
      if (!rows || rows.length === 0) {
        console.log("Nessun dato per questo KPI, salto il foglio.");
        continue;
      }

      const headers = Object.keys(rows[0]);
      const safeSheetName = sanitizeSheetName(kpi.sheetName);
      const worksheet = workbook.addWorksheet(safeSheetName);

      worksheet.columns = headers.map((header) => ({
        header,
        key: header,
        width: Math.min(Math.max(String(header).length + 4, 16), 40),
      }));

      rows.forEach((row) => {
        const normalized = {};
        headers.forEach((header) => {
          const value = row[header];
          normalized[header] = isNumericValue(value) ? Number(value) : value;
        });
        worksheet.addRow(normalized);
      });

      worksheet.getRow(1).font = { bold: true };

      processedSheetsCount += 1;
      console.log(`Foglio '${safeSheetName}' generato con ${rows.length} righe.`);
    } catch (error) {
      console.error(`Errore KPI [ ${kpi.sheetName} ]: ${error.message}`);
    }
  }

  if (processedSheetsCount === 0) {
    console.error("Nessun foglio generato: verificare filtri, indici e mapping OpenSearch.");
    return;
  }

  await workbook.xlsx.writeFile(outputFile);

  console.log("\n==================================================");
  console.log(`Report Excel generato: '${path.basename(outputFile)}'`);
  console.log("==================================================");
}

prepareAuth()
  .then(() => runPipeline())
  .catch((err) => {
  console.error("Errore fatale nella pipeline:", err);
  process.exit(1);
  });
