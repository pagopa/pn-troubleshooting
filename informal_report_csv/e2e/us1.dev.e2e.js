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
    reportContext = buildReportContext('US1', iun, cfg);
    artifactsDir = createArtifactsDir(reportContext);

    result = await callDev(cfg, iun);
    printResult('US1', result);

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

    assert(result.ok, `US1 E2E fallito: HTTP ${result.status}`);
    assert(result.bodyJson && typeof result.bodyJson === 'object', 'US1 E2E: body JSON mancante');
    assert(typeof result.bodyJson.notificationStatus === 'string', 'US1 E2E: notificationStatus mancante');
    assert(Array.isArray(result.bodyJson.notificationStatusHistory), 'US1 E2E: notificationStatusHistory non presente');
    assert(fs.existsSync(summaryCsvPath), 'US1 E2E: informal_summary.csv non generato');

    const reportFile = writeReport(reportContext, 'PASS', {
      httpStatus: result.status,
      url: result.url,
      durationMs: result.durationMs,
      timelineLength: Array.isArray(result.bodyJson.timeline) ? result.bodyJson.timeline.length : 0,
      notificationStatus: result.bodyJson.notificationStatus,
      artifactsDir,
      generatedFiles: {
        summaryCsvPath,
      },
    });

    process.stdout.write(`[US1] OK report=${reportFile} artifacts=${artifactsDir}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (!reportContext) {
      reportContext = {
        testName: 'US1',
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

    process.stderr.write(`[US1] ERROR: ${message} report=${reportFile} artifacts=${artifactsDir}\n`);
    process.exit(1);
  }
})();
