#!/usr/bin/env node
'use strict';

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
  let first;
  let second;
  let artifactsDir;

  try {
    requireManualTrigger(process.argv);
    const cfg = loadEnv();
    const iun = parseIun(process.argv);
    reportContext = buildReportContext('US4', iun, cfg);
    artifactsDir = createArtifactsDir(reportContext);

    const t1 = Date.now();
    first = await callDev(cfg, iun);
    printResult('US4-call1', first);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const t2 = Date.now();
    second = await callDev(cfg, iun);
    printResult('US4-call2', second);

    writeJsonArtifact(artifactsDir, 'dev_response_call1_json', first.bodyJson ?? { raw: first.bodyText });
    writeTextArtifact(artifactsDir, 'dev_response_call1_raw', first.bodyText);
    writeJsonArtifact(artifactsDir, 'dev_response_call2_json', second.bodyJson ?? { raw: second.bodyText });
    writeTextArtifact(artifactsDir, 'dev_response_call2_raw', second.bodyText);

    const delta = t2 - t1;

    assert(first.ok && second.ok, `US4 E2E fallito: status=${first.status}/${second.status}`);
    assert(delta >= 1000, `US4 E2E: intervallo chiamate inferiore a 1s (${delta}ms)`);

    const reportFile = writeReport(reportContext, 'PASS', {
      firstStatus: first.status,
      secondStatus: second.status,
      firstDurationMs: first.durationMs,
      secondDurationMs: second.durationMs,
      intervalMs: delta,
      url: first.url,
      artifactsDir,
    });

    process.stdout.write(`[US4] OK delta=${delta}ms report=${reportFile} artifacts=${artifactsDir}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (!reportContext) {
      reportContext = {
        testName: 'US4',
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
      firstStatus: first ? first.status : undefined,
      secondStatus: second ? second.status : undefined,
      firstDurationMs: first ? first.durationMs : undefined,
      secondDurationMs: second ? second.durationMs : undefined,
      url: first ? first.url : undefined,
      artifactsDir,
    });

    process.stderr.write(`[US4] ERROR: ${message} report=${reportFile} artifacts=${artifactsDir}\n`);
    process.exit(1);
  }
})();
