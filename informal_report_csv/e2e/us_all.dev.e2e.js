#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
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
  let artifactsDir;
  let result;

  try {
    requireManualTrigger(process.argv);
    const cfg = loadEnv();
    const iunList = parseIunsFromFile(DEFAULT_INPUT_IUNS_FILE);
    assert(iunList.length >= 1, `US_ALL E2E: nessun IUN trovato in ${DEFAULT_INPUT_IUNS_FILE}`);

    const iun = parseIun(process.argv);
    reportContext = buildReportContext('US_ALL', iun, cfg);
    artifactsDir = createArtifactsDir(reportContext);

    result = await callDev(cfg, iun);
    printResult('US_ALL-seed', result);
    assert(result.ok, `US_ALL E2E: IUN seed non valido HTTP ${result.status}`);
    assert(result.bodyJson && typeof result.bodyJson === 'object', 'US_ALL E2E: body JSON seed mancante');

    writeJsonArtifact(artifactsDir, 'dev_response_seed_json', result.bodyJson ?? { raw: result.bodyText });
    writeTextArtifact(artifactsDir, 'dev_response_seed_raw', result.bodyText);

    const outputDir = path.join(artifactsDir, 'generated_output');
    fs.mkdirSync(outputDir, { recursive: true });

    const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
    const startedAtMs = Date.now();
    let scriptExitCode = 0;
    let scriptStdout = '';
    let scriptStderr = '';
    try {
      scriptStdout = execFileSync(
        process.execPath,
        [scriptPath, '--input-file', DEFAULT_INPUT_IUNS_FILE, '--output-dir', outputDir],
        {
          cwd: path.join(__dirname, '..'),
          stdio: 'pipe',
          env: process.env,
          encoding: 'utf8',
        }
      );
    } catch (err) {
      scriptExitCode = Number.isInteger(err.status) ? err.status : 1;
      scriptStdout = err.stdout ?? '';
      scriptStderr = err.stderr ?? '';
    }
    const scriptDurationMs = Date.now() - startedAtMs;

    writeTextArtifact(artifactsDir, 'script_stdout', scriptStdout);
    writeTextArtifact(artifactsDir, 'script_stderr', scriptStderr);

    const summaryPath = path.join(outputDir, 'informal_summary.csv');
    const eventsPath = path.join(outputDir, 'informal_events.csv');
    const rawPath = path.join(outputDir, 'informal_timeline_raw.csv');
    const attachmentsPath = path.join(outputDir, 'informal_attachments.csv');
    const errorsPath = path.join(outputDir, 'informal_errors.csv');

    assert(fs.existsSync(summaryPath), 'US_ALL E2E: informal_summary.csv non generato');
    assert(fs.existsSync(eventsPath), 'US_ALL E2E: informal_events.csv non generato');
    assert(fs.existsSync(rawPath), 'US_ALL E2E: informal_timeline_raw.csv non generato');
    assert(fs.existsSync(attachmentsPath), 'US_ALL E2E: informal_attachments.csv non generato');
    assert(fs.existsSync(errorsPath), 'US_ALL E2E: informal_errors.csv non generato');

    const summary = parseCsv(fs.readFileSync(summaryPath, 'utf8'));
    const events = parseCsv(fs.readFileSync(eventsPath, 'utf8'));
    const raw = parseCsv(fs.readFileSync(rawPath, 'utf8'));
    const attachments = parseCsv(fs.readFileSync(attachmentsPath, 'utf8'));
    const errors = parseCsv(fs.readFileSync(errorsPath, 'utf8'));

    assert(scriptExitCode === 0, `US_ALL E2E: esecuzione batch fallita con exit code ${scriptExitCode}`);
    assert(summary.rows.length >= 1, `US_ALL E2E: summary rows attese>=1 ricevute=${summary.rows.length}`);
    assert(
      summary.header.join(',') === 'IUN,notificationStatus,analogCost',
      `US_ALL E2E: header summary inatteso ${summary.header.join(',')}`
    );
    assert(summary.rows.every((row) => row.analogCost === '0'), 'US_ALL E2E: analogCost deve essere 0');
    assert(events.rows.length >= 1, 'US_ALL E2E: events deve contenere almeno una riga');
    assert(
      raw.header.join(',') === 'IUN,TIMELINE_ELEMENT_ID,BUSINESS_TIMESTAMP,JSON',
      `US_ALL E2E: header raw inatteso ${raw.header.join(',')}`
    );
    assert(raw.rows.length >= 1, 'US_ALL E2E: timeline raw deve contenere almeno una riga');

    const firstRawRow = raw.rows[0];
    assert(firstRawRow.JSON && firstRawRow.JSON.trim().length > 0, 'US_ALL E2E: colonna JSON vuota nella prima riga');

    let parsedRawJson;
    try {
      parsedRawJson = JSON.parse(firstRawRow.JSON);
    } catch (err) {
      const parseMessage = err instanceof Error ? err.message : String(err);
      throw new Error(`US_ALL E2E: JSON.parse fallita sulla prima riga timeline_raw: ${parseMessage}`);
    }

    assert(parsedRawJson && typeof parsedRawJson === 'object', 'US_ALL E2E: il JSON parsato non e un oggetto');
    assert(
      parsedRawJson.informalElement && typeof parsedRawJson.informalElement === 'object',
      'US_ALL E2E: payload parsato senza campo informalElement valido'
    );

    assert(scriptDurationMs >= 1000, `US_ALL E2E: durata troppo bassa per test 1 RPS (${scriptDurationMs}ms)`);

    const reportFile = writeReport(reportContext, 'PASS', {
      seedHttpStatus: result.status,
      seedUrl: result.url,
      seedDurationMs: result.durationMs,
      scriptExitCode,
      scriptDurationMs,
      uniqueIunsProcessed: new Set(iunList).size,
      inputIunsFile: DEFAULT_INPUT_IUNS_FILE,
      csvCounts: {
        summary: summary.rows.length,
        events: events.rows.length,
        timelineRaw: raw.rows.length,
        attachments: attachments.rows.length,
        errors: errors.rows.length,
      },
      rawJsonCheck: {
        firstRowElementId: firstRawRow.TIMELINE_ELEMENT_ID,
        firstRowBusinessTimestamp: firstRawRow.BUSINESS_TIMESTAMP,
        parsedElementId: parsedRawJson.informalElement.elementId ?? null,
      },
      artifactsDir,
      generatedFiles: {
        summaryPath,
        eventsPath,
        rawPath,
        attachmentsPath,
        errorsPath,
      },
    });

    process.stdout.write(`[US_ALL] OK report=${reportFile} artifacts=${artifactsDir}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (!reportContext) {
      reportContext = {
        testName: 'US_ALL',
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
      seedHttpStatus: result ? result.status : undefined,
      seedUrl: result ? result.url : undefined,
      seedDurationMs: result ? result.durationMs : undefined,
      artifactsDir,
    });

    process.stderr.write(`[US_ALL] ERROR: ${message} report=${reportFile} artifacts=${artifactsDir}\n`);
    process.exit(1);
  }
})();
