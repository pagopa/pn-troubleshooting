#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  requireManualTrigger,
  parseIun,
  loadEnv,
  callDev,
  assert,
  printResult,
  buildReportContext,
  createArtifactsDir,
  writeJsonArtifact,
  writeTextArtifact,
  writeReport,
} = require('./devE2eCommon');

function parseCsv(content) {
  const lines = content.trimEnd().split('\n');
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current);

    const obj = {};
    for (let i = 0; i < header.length; i += 1) {
      obj[header[i]] = values[i] ?? '';
    }
    return obj;
  });

  return { header, rows };
}

(async () => {
  let reportContext;
  let result;
  let artifactsDir;

  try {
    requireManualTrigger(process.argv);
    const cfg = loadEnv();
    const iun = parseIun(process.argv);
    reportContext = buildReportContext('US5', iun, cfg);
    artifactsDir = createArtifactsDir(reportContext);

    result = await callDev(cfg, iun);
    printResult('US5', result);

    writeJsonArtifact(artifactsDir, 'dev_response_json', result.bodyJson ?? { raw: result.bodyText });
    writeTextArtifact(artifactsDir, 'dev_response_raw', result.bodyText);

    const outputDir = path.join(artifactsDir, 'generated_output');
    fs.mkdirSync(outputDir, { recursive: true });

    const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
    execFileSync(process.execPath, [scriptPath, '--iun', iun, '--output-dir', outputDir], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      env: process.env,
      encoding: 'utf8',
    });

    const timelineRawCsvPath = path.join(outputDir, 'informal_timeline_raw.csv');

    assert(result.ok, `US5 E2E fallito: HTTP ${result.status}`);
    assert(result.bodyJson && typeof result.bodyJson === 'object', 'US5 E2E: body JSON mancante');
    assert(fs.existsSync(timelineRawCsvPath), 'US5 E2E: informal_timeline_raw.csv non generato');

    const raw = parseCsv(fs.readFileSync(timelineRawCsvPath, 'utf8'));
    assert(
      raw.header.join(',') === 'IUN,TIMELINE_ELEMENT_ID,BUSINESS_TIMESTAMP,JSON',
      `US5 E2E: header raw inatteso ${raw.header.join(',')}`
    );
    assert(raw.rows.length >= 1, 'US5 E2E: timeline raw deve contenere almeno una riga');

    const firstRow = raw.rows[0];
    assert(firstRow.JSON && firstRow.JSON.trim().length > 0, 'US5 E2E: colonna JSON vuota nella prima riga');

    let parsedJson;
    try {
      parsedJson = JSON.parse(firstRow.JSON);
    } catch (err) {
      const parseMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`US5 E2E: JSON.parse fallita sulla prima riga timeline_raw: ${parseMessage}`);
    }

    assert(parsedJson && typeof parsedJson === 'object', 'US5 E2E: il JSON parsato non e un oggetto');
    assert(
      parsedJson.informalElement && typeof parsedJson.informalElement === 'object',
      'US5 E2E: payload parsato senza campo informalElement valido'
    );

    const reportFile = writeReport(reportContext, 'PASS', {
      httpStatus: result.status,
      url: result.url,
      durationMs: result.durationMs,
      timelineRawRows: raw.rows.length,
      firstRowElementId: firstRow.TIMELINE_ELEMENT_ID,
      firstRowBusinessTimestamp: firstRow.BUSINESS_TIMESTAMP,
      parsedElementId: parsedJson.informalElement.elementId ?? null,
      artifactsDir,
      generatedFiles: {
        timelineRawCsvPath,
      },
    });

    process.stdout.write(`[US5] OK report=${reportFile} artifacts=${artifactsDir}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (!reportContext) {
      reportContext = {
        testName: 'US5',
        iun: 'UNKNOWN',
        startIso: new Date().toISOString(),
        baseUrl: 'UNKNOWN',
        endpointTemplate: '/informal/delivery/v1/notifications/sent/{iun}?retrieveMessage=true',
      };
    }

    if (!artifactsDir) {
      artifactsDir = createArtifactsDir(reportContext);
    }

    writeTextArtifact(artifactsDir, 'failure_message', message);

    const reportFile = writeReport(reportContext, 'FAIL', {
      errorMessage: message,
      httpStatus: result ? result.status : undefined,
      url: result ? result.url : undefined,
      durationMs: result ? result.durationMs : undefined,
      artifactsDir,
    });

    process.stderr.write(`[US5] ERROR: ${message} report=${reportFile} artifacts=${artifactsDir}\n`);
    process.exit(1);
  }
})();
