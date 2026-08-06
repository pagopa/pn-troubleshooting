#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const assert = require('node:assert/strict');

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

function execFileAsync(cmd, args, options) {
  return new Promise((resolve) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

async function run() {
  const iunA = 'TEST-US4-A';
  const iunB = 'TEST-US4-B';
  const requestTimestamps = [];
  const attemptsByIun = new Map();

  function payloadFor(iun) {
    return {
      iun,
      notificationStatus: 'COMPLETED_REACHED',
      notificationStatusHistory: [
        {
          status: 'ACCEPTED',
          activeFrom: '2026-07-21T16:23:52.020346318Z',
          relatedTimelineElements: [`REQUEST_ACCEPTED.IUN_${iun}`],
        },
      ],
      timeline: [
        {
          elementId: `REQUEST_ACCEPTED.IUN_${iun}`,
          category: 'REQUEST_ACCEPTED',
          eventTimestamp: '2026-07-21T16:25:27.584650008Z',
          details: {
            notificationRequestId: `nr-${iun}`,
          },
        },
      ],
      documents: [],
    };
  }

  const expectedNotificationRequestIdA = Buffer.from(iunA, 'utf8').toString('base64');
  const expectedNotificationRequestIdB = Buffer.from(iunB, 'utf8').toString('base64');

  const server = http.createServer((req, res) => {
    requestTimestamps.push(Date.now());

    const match = req.url.match(/^\/informal\/delivery\/v1\/notifications\/sent\/([^?]+)\?retrieveMessage=true$/);
    if (!match) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    const iun = decodeURIComponent(match[1]);
    const currentAttempt = (attemptsByIun.get(iun) ?? 0) + 1;
    attemptsByIun.set(iun, currentAttempt);

    if (iun === iunA && currentAttempt === 1) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'temporary unavailable' }));
      return;
    }

    if (iun === iunA || iun === iunB) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payloadFor(iun)));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(18087, '127.0.0.1', resolve));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us4-mock-'));
  const envPath = path.join(tempDir, '.env');
  const inputPath = path.join(tempDir, 'iuns.txt');
  const outDir = path.join(tempDir, 'out');

  fs.writeFileSync(envPath, 'INFORMAL_BASE_URL=http://127.0.0.1:18087\nINFORMAL_API_KEY=test-key\n', 'utf8');
  fs.writeFileSync(inputPath, `${iunA}\n${iunB}\n`, 'utf8');

  try {
    const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
    const result = await execFileAsync(
      process.execPath,
      [scriptPath, '--env-file', envPath, '--input-file', inputPath, '--output-dir', outDir],
      { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8' }
    );

    assert.equal(result.error, null, `lo script non deve fallire su retry transient: ${result.stderr}`);
    assert.equal(requestTimestamps.length, 3, 'attese 3 chiamate totali (1 retry + 2 successi)');

    for (let i = 1; i < requestTimestamps.length; i += 1) {
      const deltaMs = requestTimestamps[i] - requestTimestamps[i - 1];
      assert(
        deltaMs >= 1000,
        `rate limit violato: intervallo ${deltaMs}ms tra chiamate ${i} e ${i + 1}`
      );
    }

    const summary = parseCsv(fs.readFileSync(path.join(outDir, 'informal_summary.csv'), 'utf8'));
    const raw = parseCsv(fs.readFileSync(path.join(outDir, 'informal_timeline_raw.csv'), 'utf8'));
    const errors = parseCsv(fs.readFileSync(path.join(outDir, 'informal_errors.csv'), 'utf8'));

    assert.equal(summary.rows.length, 2, 'summary deve contenere i due IUN processati');
    assert.deepEqual(summary.header, ['IUN', 'notificationStatus', 'analogCost']);
    assert(summary.rows.every((row) => row.analogCost === '0'), 'analogCost deve essere sempre 0');
    assert.equal(raw.rows.length, 2, 'raw deve contenere un elemento per ogni IUN');
    const rawEvent = JSON.parse(raw.rows[0].JSON);
    assert.match(rawEvent.eventId, /^[0-9a-f-]{36}$/i);
    assert.equal(rawEvent.newStatus, 'ACCEPTED');
    assert.equal(rawEvent.notificationRequestId, expectedNotificationRequestIdA);
    assert.equal(rawEvent.ttl, 1);
    assert.equal(rawEvent.eventDescription, `${payloadFor(iunA).timeline[0].eventTimestamp}_${payloadFor(iunA).timeline[0].elementId}`);
    assert.equal(rawEvent.informalElement.elementId, `REQUEST_ACCEPTED.IUN_${iunA}`);
    const rawEventB = JSON.parse(raw.rows[1].JSON);
    assert.equal(rawEventB.notificationRequestId, expectedNotificationRequestIdB);
    assert.equal(rawEventB.ttl, 1);
    assert.equal(rawEventB.eventDescription, `${payloadFor(iunB).timeline[0].eventTimestamp}_${payloadFor(iunB).timeline[0].elementId}`);
    assert.equal(errors.rows.length, 0, 'errors deve essere vuoto dopo retry transient riuscito');

    process.stdout.write('US4 mock test passed\n');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  process.stderr.write(`US4 mock test failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
