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

(async () => {
  let reportContext;
  let result;
  let artifactsDir;

  try {
    requireManualTrigger(process.argv);
    const cfg = loadEnv();
    const iun = parseIun(process.argv);
    reportContext = buildReportContext('US3', iun, cfg);
    artifactsDir = createArtifactsDir(reportContext);

    result = await callDev(cfg, iun);
    printResult('US3', result);

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

    const summaryCsvPath = path.join(outputDir, 'informal_summary.csv');
    const timelineRawCsvPath = path.join(outputDir, 'informal_timeline_raw.csv');

    assert(result.ok, `US3 E2E fallito: HTTP ${result.status}`);
    assert(result.bodyJson && typeof result.bodyJson === 'object', 'US3 E2E: body JSON mancante');
    assert(Array.isArray(result.bodyJson.documents), 'US3 E2E: documents non presente');
    assert(Array.isArray(result.bodyJson.timeline), 'US3 E2E: timeline non presente');
    assert(fs.existsSync(summaryCsvPath), 'US3 E2E: informal_summary.csv non generato');
    assert(fs.existsSync(timelineRawCsvPath), 'US3 E2E: informal_timeline_raw.csv non generato');

    const reportFile = writeReport(reportContext, 'PASS', {
      httpStatus: result.status,
      url: result.url,
      durationMs: result.durationMs,
      documentsCount: result.bodyJson.documents.length,
      timelineLength: result.bodyJson.timeline.length,
      artifactsDir,
      generatedFiles: {
        summaryCsvPath,
        timelineRawCsvPath,
      },
    });

    process.stdout.write(`[US3] OK report=${reportFile} artifacts=${artifactsDir}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (!reportContext) {
      reportContext = {
        testName: 'US3',
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

    process.stderr.write(`[US3] ERROR: ${message} report=${reportFile} artifacts=${artifactsDir}\n`);
    process.exit(1);
  }
})();
