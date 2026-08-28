#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const dotenv = require('dotenv');
const { sendReportEmail } = require('./lib/mailer');

const INFORMAL_ENDPOINT_TEMPLATE = '/informal/delivery/v1/notifications/sent/{iun}?retrieveMessage=true';
const RATE_LIMIT_INTERVAL_MS = 1000;
const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 2;
const RAW_TIMELINE_TTL = 1;

const DISALLOWED_OVERRIDE_FLAGS = new Set([
  '--base-url',
  '--api-key',
  '--auth-token',
  '--endpoint-template',
  '--smtp-host',
  '--smtp-port',
  '--smtp-user',
  '--smtp-password',
  '--smtp-from',
  '--mail-provider',
  '--mail-from',
  '--aws-region',
]);

const VALID_MAIL_PROVIDERS = new Set(['smtp', 'ses']);

// Validazione permissiva (non RFC 5322 completa): sufficiente a scartare input palesemente errati.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv) {
  const args = {
    outputDir: process.cwd(),
    timeoutMs: 30000,
    rateLimitMs: RATE_LIMIT_INTERVAL_MS,
    envFile: path.join(__dirname, '.env'),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`Argomento non riconosciuto: ${token}`);
    }

    if (DISALLOWED_OVERRIDE_FLAGS.has(token)) {
      throw new Error(`Flag non consentita: ${token}. Endpoint e credenziali devono essere letti da .env`);
    }

    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Valore mancante per ${token}`);
    }

    switch (token) {
      case '--iun':
        args.iun = next;
        break;
      case '--input-file':
        args.inputFile = next;
        break;
      case '--output-dir':
        args.outputDir = next;
        break;
      case '--env-file':
        args.envFile = next;
        break;
      case '--timeout-ms':
        args.timeoutMs = Number(next);
        if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
          throw new Error('--timeout-ms deve essere un intero positivo');
        }
        break;
      case '--rate-limit-ms':
        args.rateLimitMs = Number(next);
        if (!Number.isInteger(args.rateLimitMs) || args.rateLimitMs <= 0) {
          throw new Error('--rate-limit-ms deve essere un intero positivo');
        }
        break;
      case '--mail':
        if (!EMAIL_REGEX.test(next)) {
          throw new Error(`Indirizzo email non valido per --mail: ${next}`);
        }
        args.mail = next;
        break;
      default:
        throw new Error(`Argomento non supportato: ${token}`);
    }

    i += 1;
  }

  return args;
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

function loadEnvironment(args) {
  const resolvedEnvPath = path.resolve(args.envFile);

  if (!fs.existsSync(resolvedEnvPath)) {
    throw new Error(`File .env non trovato: ${resolvedEnvPath}`);
  }

  const result = dotenv.config({ path: resolvedEnvPath });
  if (result.error) {
    throw result.error;
  }

  args.baseUrl = normalizeBaseUrl(process.env.INFORMAL_BASE_URL);
  args.apiKey = stripWrappingQuotes(process.env.INFORMAL_API_KEY);
  args.authToken = stripWrappingQuotes(process.env.INFORMAL_AUTH_TOKEN);

  args.mailConfig = loadMailConfig();
}

function normalizeMailProvider(rawValue) {
  const value = stripWrappingQuotes(rawValue);
  return value ? value.toLowerCase() : 'smtp';
}

function loadMailConfig() {
  const provider = normalizeMailProvider(process.env.MAIL_PROVIDER);
  const from = stripWrappingQuotes(process.env.MAIL_FROM);

  if (provider === 'ses') {
    return loadSesConfig(provider, from);
  }

  return loadSmtpConfig(provider, from);
}

function loadSmtpConfig(provider, from) {
  const host = stripWrappingQuotes(process.env.SMTP_HOST);
  const rawPort = stripWrappingQuotes(process.env.SMTP_PORT);
  const port = rawPort ? Number(rawPort) : undefined;
  const user = stripWrappingQuotes(process.env.SMTP_USER);
  const password = stripWrappingQuotes(process.env.SMTP_PASSWORD);
  const rawSecure = stripWrappingQuotes(process.env.SMTP_SECURE);
  const secure = rawSecure ? rawSecure.toLowerCase() === 'true' : port === 465;

  return { provider, host, port, user, password, from, secure };
}

function loadSesConfig(provider, from) {
  const region = stripWrappingQuotes(process.env.AWS_REGION);

  return { provider, region, from };
}

function printHelp() {
  const text = `
Uso:
  node export_informal_csv.js [--iun <iun> | --input-file <path>] [opzioni]

Opzioni:
  --iun <iun>            IUN singolo da interrogare
  --input-file <path>    File con lista IUN (uno per riga)
  --output-dir <path>    Directory output CSV (default: cwd)
  --env-file <path>      Path file .env (default: scripts/client/informal_csv_report/.env)
  --timeout-ms <ms>      Timeout chiamata API (default: 30000)
  --rate-limit-ms <ms>   Intervallo minimo tra chiamate API (default: 1000)
  --mail <indirizzo>     Invia i CSV generati come allegati a questo indirizzo
  --help                 Mostra questo aiuto

Nota: endpoint, credenziali API e configurazione email (SMTP o SES) NON possono
essere passati via CLI. Devono essere presenti in .env.

Variabili ambiente obbligatorie:
  INFORMAL_BASE_URL
  INFORMAL_API_KEY

Variabili ambiente opzionali:
  INFORMAL_AUTH_TOKEN

Variabili ambiente opzionali se si usa --mail:
  MAIL_PROVIDER          smtp (default) oppure ses

Variabili ambiente obbligatorie se si usa --mail con MAIL_PROVIDER=smtp (default):
  SMTP_HOST
  SMTP_PORT
  SMTP_USER
  SMTP_PASSWORD
  MAIL_FROM

Variabili ambiente opzionali se si usa --mail con MAIL_PROVIDER=smtp:
  SMTP_SECURE            true/false (default: true se SMTP_PORT=465, altrimenti false)

Variabili ambiente obbligatorie se si usa --mail con MAIL_PROVIDER=ses:
  AWS_REGION
  MAIL_FROM

Nota su MAIL_PROVIDER=ses: le credenziali AWS non vanno mai in .env o via CLI.
Vengono risolte dalla default AWS credential provider chain (es. ruolo IAM di un
CodeBuild, profilo locale, variabili AWS_* standard dell'ambiente).
`;
  process.stdout.write(text);
}

function ensureRequired(args) {
  if (!args.baseUrl) {
    throw new Error('Variabile obbligatoria mancante in .env: INFORMAL_BASE_URL');
  }
  if (!args.apiKey) {
    throw new Error('Variabile obbligatoria mancante in .env: INFORMAL_API_KEY');
  }
  if (!args.iun && !args.inputFile) {
    throw new Error('Specificare --iun oppure --input-file');
  }

  if (args.mail) {
    ensureMailConfigured(args.mailConfig);
  }
}

function ensureMailConfigured(mailConfig) {
  if (mailConfig.provider === 'ses') {
    ensureSesConfigured(mailConfig);
    return;
  }
  if (mailConfig.provider === 'smtp') {
    ensureSmtpConfigured(mailConfig);
    return;
  }
  throw new Error(
    `MAIL_PROVIDER non valido: "${mailConfig.provider}". Valori supportati: ${Array.from(VALID_MAIL_PROVIDERS).join(', ')}`
  );
}

function ensureSmtpConfigured(smtp) {
  const missing = [];
  if (!smtp.host) missing.push('SMTP_HOST');
  if (!smtp.port || !Number.isInteger(smtp.port) || smtp.port <= 0) missing.push('SMTP_PORT');
  if (!smtp.user) missing.push('SMTP_USER');
  if (!smtp.password) missing.push('SMTP_PASSWORD');
  if (!smtp.from) missing.push('MAIL_FROM');

  if (missing.length > 0) {
    throw new Error(
      `--mail richiede la configurazione SMTP in .env. Variabile/i mancante/i o non valida/e: ${missing.join(', ')}`
    );
  }
}

function ensureSesConfigured(ses) {
  const missing = [];
  if (!ses.region) missing.push('AWS_REGION');
  if (!ses.from) missing.push('MAIL_FROM');

  if (missing.length > 0) {
    throw new Error(
      `--mail richiede la configurazione SES in .env. Variabile/i mancante/i o non valida/e: ${missing.join(', ')}`
    );
  }
}

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
}

function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => toCsvValue(row[h])).join(','));
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, { encoding: 'utf-8' });
}

function toJsonString(value) {
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function computeLatestStatusAt(notificationStatusHistory) {
  if (!Array.isArray(notificationStatusHistory) || notificationStatusHistory.length === 0) {
    return '';
  }

  let latest = '';
  for (const item of notificationStatusHistory) {
    const value = item && item.activeFrom ? String(item.activeFrom) : '';
    if (!value) continue;
    if (!latest || value > latest) {
      latest = value;
    }
  }
  return latest;
}

function buildTimelineStatusIndex(detail) {
  const idx = new Map();
  if (!Array.isArray(detail.notificationStatusHistory)) {
    return idx;
  }

  for (const historyItem of detail.notificationStatusHistory) {
    const status = historyItem?.status ?? '';
    const related = historyItem?.relatedTimelineElements;
    if (!status || !Array.isArray(related)) continue;

    for (const elementId of related) {
      if (typeof elementId === 'string' && elementId.length > 0) {
        idx.set(elementId, status);
      }
    }
  }

  return idx;
}

function buildProgressResponseElement(iun, detail, timelineElement, statusByElement) {
  const elementId = timelineElement?.elementId ?? '';
  const eventTimestamp = timelineElement?.eventTimestamp ?? timelineElement?.timestamp ?? '';
  const notificationRequestId = Buffer.from(String(iun), 'utf8').toString('base64');

  // eslint-disable-next-line no-unused-vars
  const { InformaltimelineEventCategory: _removed, ...cleanedElement } = timelineElement ?? {};
  const progressResponseElement = {
    eventId: randomUUID(),
    iun,
    informalElement: cleanedElement,
    notificationRequestId,
    ttl: RAW_TIMELINE_TTL,
  };

  const newStatus = statusByElement.get(elementId);
  if (newStatus !== undefined) {
    progressResponseElement.newStatus = newStatus;
  }

  progressResponseElement.eventDescription = `${eventTimestamp}_${elementId}`;

  return progressResponseElement;
}

function buildHeaders(args) {
  const headers = {
    Accept: 'application/json',
    'x-api-key': args.apiKey,
  };

  if (args.authToken) {
    headers.Authorization = 'Bearer ' + args.authToken;
  }

  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRequestSlot(rateLimiterState) {
  const now = Date.now();
  if (now < rateLimiterState.nextAllowedAtMs) {
    await sleep(rateLimiterState.nextAllowedAtMs - now);
  }
}

function isTransientHttpStatus(status) {
  return TRANSIENT_HTTP_STATUSES.has(status);
}

function isTransientFetchError(error) {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.name === 'TypeError';
}

async function fetchInformalDetail(args, iun, rateLimiterState) {
  if (typeof fetch !== 'function') {
    throw new Error('Runtime Node non supporta fetch globale (richiesto Node.js >= 18)');
  }

  const endpoint = INFORMAL_ENDPOINT_TEMPLATE.replace('{iun}', encodeURIComponent(iun));
  const url = new URL(endpoint, args.baseUrl).toString();
  const headers = buildHeaders(args);

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    await waitForRequestSlot(rateLimiterState);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), args.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const bodySnippet = body.slice(0, 500);
        const err = new Error(`HTTP_${response.status} ${response.statusText}: ${bodySnippet}`);
        err.httpStatus = response.status;
        if (isTransientHttpStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES) {
          process.stderr.write(
            `Retry transient per IUN=${iun}: HTTP_${response.status} tentativo ${attempt + 1}/${MAX_TRANSIENT_RETRIES}\n`
          );
          continue;
        }
        throw err;
      }

      return await response.json();
    } catch (error) {
      if (isTransientFetchError(error) && attempt < MAX_TRANSIENT_RETRIES) {
        process.stderr.write(
          `Retry transient per IUN=${iun}: ${error.name} tentativo ${attempt + 1}/${MAX_TRANSIENT_RETRIES}\n`
        );
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      rateLimiterState.nextAllowedAtMs = Date.now() + args.rateLimitMs;
    }
  }

  throw new Error('Errore inatteso nel loop retry');
}

function ensureOutputDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveIuns(args) {
  const collected = [];

  if (args.iun) {
    collected.push(String(args.iun).trim());
  }

  if (args.inputFile) {
    const resolved = path.resolve(args.inputFile);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File input non trovato: ${resolved}`);
    }

    const lines = fs.readFileSync(resolved, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      collected.push(line);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const iun of collected) {
    if (!iun) continue;
    if (seen.has(iun)) continue;
    seen.add(iun);
    unique.push(iun);
  }

  if (unique.length === 0) {
    throw new Error('Nessun IUN valido trovato nei parametri forniti');
  }

  return unique;
}

function buildSummaryRow(iun, detail, retrievedAt) {
  void retrievedAt;
  return {
    IUN: iun,
    notificationStatus: detail.notificationStatus ?? '',
    analogCost: 0,
  };
}

function buildTimelineRawRows(iun, detail) {
  const timeline = Array.isArray(detail.timeline) ? detail.timeline : [];
  const statusByElement = buildTimelineStatusIndex(detail);

  return timeline.map((element, idx) => ({
    IUN: iun,
    TIMELINE_ELEMENT_ID: element?.elementId ?? idx,
    BUSINESS_TIMESTAMP: element?.eventTimestamp ?? '',
    JSON: toJsonString(buildProgressResponseElement(iun, detail, element, statusByElement)),
  }));
}

function buildErrorRow(iun, error, retrievedAt) {
  const type = error && error.httpStatus ? `HTTP_${error.httpStatus}` : 'GENERIC_ERROR';
  return {
    iun,
    errorType: type,
    errorMessage: error instanceof Error ? error.message : String(error),
    retrievedAt,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    return;
  }

  loadEnvironment(args);
  ensureRequired(args);
  ensureOutputDir(args.outputDir);

  const summaryPath = path.join(args.outputDir, 'informal_summary.csv');
  const timelineRawPath = path.join(args.outputDir, 'informal_timeline_raw.csv');

  const summaryRows = [];
  const rawRows = [];
  const errorRows = [];
  const rateLimiterState = { nextAllowedAtMs: 0 };

  const iuns = resolveIuns(args);

  for (const iun of iuns) {
    const retrievedAt = new Date().toISOString();

    try {
      process.stdout.write(`Recupero notifica informale IUN=${iun}\n`);
      const detail = await fetchInformalDetail(args, iun, rateLimiterState);

      summaryRows.push(buildSummaryRow(iun, detail, retrievedAt));
      rawRows.push(...buildTimelineRawRows(iun, detail));
    } catch (error) {
      const errorRow = buildErrorRow(iun, error, retrievedAt);
      errorRows.push(errorRow);
      process.stderr.write(`Errore durante l'elaborazione IUN=${iun}: ${errorRow.errorMessage}\n`);
    }
  }

  writeCsv(
    summaryPath,
    ['IUN', 'notificationStatus', 'analogCost'],
    summaryRows
  );
  writeCsv(timelineRawPath, ['IUN', 'TIMELINE_ELEMENT_ID', 'BUSINESS_TIMESTAMP', 'JSON'], rawRows);

  process.stdout.write(`Creato file: ${summaryPath}\n`);
  process.stdout.write(`Creato file: ${timelineRawPath}\n`);

  if (errorRows.length > 0) {
    process.exitCode = 1;
  }

  if (args.mail) {
    const stats = {
      requestedCount: iuns.length,
      processedCount: summaryRows.length,
      errorCount: errorRows.length,
      timelineRawCount: rawRows.length,
      generatedAt: new Date().toISOString(),
    };

    try {
      await sendReportEmail({
        transportConfig: args.mailConfig,
        to: args.mail,
        files: [summaryPath, timelineRawPath],
        stats,
      });
      process.stdout.write(`Report inviato via email a ${args.mail}\n`);
    } catch (error) {
      process.stderr.write(
        `${error.message}. I CSV generati restano disponibili in: ${args.outputDir}\n`
      );
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  process.stderr.write(`Errore non gestito: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
