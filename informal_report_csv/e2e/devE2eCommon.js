'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const INFORMAL_ENDPOINT_TEMPLATE = '/informal/delivery/v1/notifications/sent/{iun}?retrieveMessage=true';
const TMP_DIR = path.join(__dirname, '..', 'tmp');
const DEFAULT_INPUT_IUNS_FILE = path.join(TMP_DIR, 'inputIuns.txt');
const REPORTS_DIR = path.join(TMP_DIR, 'e2e', 'reports');
const REPORT_INDEX = path.join(REPORTS_DIR, 'latest-summary.json');

function requireManualTrigger(argv) {
  if (!argv.includes('--run-dev-e2e')) {
    throw new Error('Test DEV E2E bloccato: eseguire esplicitamente con --run-dev-e2e');
  }

  if (process.env.CI === 'true') {
    throw new Error('Test DEV E2E bloccato in CI: non deve essere eseguito automaticamente');
  }
}

function parseIunsFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function parseIun(argv) {
  const idx = argv.indexOf('--iun');
  if (idx !== -1) {
    const value = argv[idx + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('Valore mancante per --iun');
    }
    return value;
  }

  const fromEnv = process.env.INFORMAL_TEST_IUN;
  if (fromEnv) {
    return fromEnv;
  }

  const fromFile = parseIunsFromFile(DEFAULT_INPUT_IUNS_FILE);
  if (fromFile.length > 0) {
    return fromFile[0];
  }

  throw new Error(
    `Specificare --iun <value> oppure env INFORMAL_TEST_IUN oppure valorizzare ${DEFAULT_INPUT_IUNS_FILE}`
  );
}

function stripWrappingQuotes(value) {
  if (!value) return value;
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeBaseUrl(value) {
  const raw = stripWrappingQuotes(value);
  if (!raw) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  return `https://${raw}`;
}

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env non trovato: ${envPath}`);
  }

  const result = dotenv.config({ path: envPath });
  if (result.error) throw result.error;

  const baseUrl = normalizeBaseUrl(process.env.INFORMAL_BASE_URL);
  const apiKey = stripWrappingQuotes(process.env.INFORMAL_API_KEY);
  const authToken = stripWrappingQuotes(process.env.INFORMAL_AUTH_TOKEN);

  if (!baseUrl) throw new Error('INFORMAL_BASE_URL mancante in .env');
  if (!apiKey) throw new Error('INFORMAL_API_KEY mancante in .env');

  return { baseUrl, apiKey, authToken, envPath };
}

function buildHeaders(cfg) {
  const headers = {
    Accept: 'application/json',
    'x-api-key': cfg.apiKey,
  };
  if (cfg.authToken) {
    headers.Authorization = `Bearer ${cfg.authToken}`;
  }
  return headers;
}

async function callDev(cfg, iun) {
  const endpoint = INFORMAL_ENDPOINT_TEMPLATE.replace('{iun}', encodeURIComponent(iun));
  const url = new URL(endpoint, cfg.baseUrl).toString();

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(cfg),
  });

  const bodyText = await response.text();
  let bodyJson = null;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    // noop
  }

  return {
    url,
    status: response.status,
    ok: response.ok,
    bodyText,
    bodyJson,
    startedAt,
    durationMs: Date.now() - startedAt,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function printResult(testName, result) {
  process.stdout.write(`[${testName}] status=${result.status} url=${result.url}\n`);
}

function buildReportContext(testName, iun, cfg) {
  const startIso = new Date().toISOString();
  return {
    testName,
    iun,
    startIso,
    baseUrl: cfg.baseUrl,
    endpointTemplate: INFORMAL_ENDPOINT_TEMPLATE,
    apiKeyLength: cfg.apiKey ? cfg.apiKey.length : 0,
    hasAuthToken: Boolean(cfg.authToken),
  };
}

function ensureReportsDir() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function toSafeName(value) {
  return String(value).toLowerCase().replaceAll(/[^a-z0-9_-]/g, '-');
}

function createArtifactsDir(context) {
  ensureReportsDir();
  const timestamp = context.startIso.replaceAll(':', '-').replaceAll('.', '-');
  const safeName = toSafeName(context.testName);
  const dir = path.join(REPORTS_DIR, `${timestamp}_${safeName}_artifacts`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJsonArtifact(artifactsDir, name, value) {
  const target = path.join(artifactsDir, `${name}.json`);
  fs.writeFileSync(target, JSON.stringify(value, null, 2), 'utf8');
  return target;
}

function writeTextArtifact(artifactsDir, name, value) {
  const target = path.join(artifactsDir, `${name}.txt`);
  fs.writeFileSync(target, String(value ?? ''), 'utf8');
  return target;
}

function writeReport(context, status, details = {}) {
  ensureReportsDir();

  const endIso = new Date().toISOString();
  const safeName = toSafeName(context.testName);
  const timestamp = endIso.replaceAll(':', '-').replaceAll('.', '-');
  const reportFile = path.join(REPORTS_DIR, `${timestamp}_${safeName}.json`);

  const report = {
    ...context,
    endIso,
    status,
    ...details,
  };







  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf8');

  let summary = [];
  try {
  const prev = JSON.parse(fs.readFileSync(REPORT_INDEX, 'utf8'));
  if (Array.isArray(prev)) summary = prev;
} catch (err) {
  if (err.code !== 'ENOENT') {
    // file esiste ma non è leggibile/parsabile per un altro motivo: logga se vuoi, ma non bloccare il test
  }
  summary = [];
}


  summary.push({
    testName: context.testName,
    iun: context.iun,
    status,
    reportFile,
    artifactsDir: details.artifactsDir,
    endIso,
  });

  summary = summary.slice(-50);
  fs.writeFileSync(REPORT_INDEX, JSON.stringify(summary, null, 2), 'utf8');

  return reportFile;
}

module.exports = {
  requireManualTrigger,
  parseIun,
  parseIunsFromFile,
  DEFAULT_INPUT_IUNS_FILE,
  loadEnv,
  callDev,
  assert,
  printResult,
  buildReportContext,
  createArtifactsDir,
  writeJsonArtifact,
  writeTextArtifact,
  writeReport,
};
