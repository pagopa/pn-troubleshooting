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
  return new Promise((resolve, reject) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function run() {
  const iun = 'TEST-US2-IUN';
  const payload = {
    iun,
    notificationStatus: 'COMPLETED_REACHED',
    notificationStatusHistory: [
      {
        status: 'ACCEPTED',
        activeFrom: '2026-07-21T16:23:52.020346318Z',
        relatedTimelineElements: [`REQUEST_ACCEPTED.IUN_${iun}`],
      },
      {
        status: 'PROCESSING',
        activeFrom: '2026-07-21T16:34:59.670716450Z',
        relatedTimelineElements: [`SEND_ANALOG_MESSAGE.IUN_${iun}.RECINDEX_0.ATTEMPT_0.DELIVERYTYPE_RS`],
      },
      {
        status: 'COMPLETED_REACHED',
        activeFrom: '2026-07-21T16:39:51.676484175Z',
        relatedTimelineElements: [`WORKFLOW_DONE_REACHED.IUN_${iun}.RECINDEX_0`],
      },
    ],
    timeline: [
      {
        elementId: `REQUEST_ACCEPTED.IUN_${iun}`,
        eventTimestamp: '2026-07-21T16:25:27.584650008Z',
        category: 'REQUEST_ACCEPTED',
        details: { notificationRequestId: 'abc' },
      },
      {
        elementId: `SEND_ANALOG_MESSAGE.IUN_${iun}.RECINDEX_0.ATTEMPT_0.DELIVERYTYPE_RS`,
        eventTimestamp: '2026-07-21T16:34:59.670716450Z',
        category: 'SEND_ANALOG_MESSAGE',
        details: { recIndex: 0, analogCost: 227, numberOfPages: 2, envelopeWeight: 15, deliveryType: 'RS' },
      },
      {
        elementId: `WORKFLOW_DONE_REACHED.IUN_${iun}.RECINDEX_0`,
        eventTimestamp: '2026-07-21T16:39:51.676484175Z',
        category: 'WORKFLOW_DONE_REACHED',
        details: { recIndex: 0, completionFeedback: 'RECEIVED' },
      },
    ],
  };

  const server = http.createServer((req, res) => {
    if (req.url === `/informal/delivery/v1/notifications/sent/${iun}?retrieveMessage=true`) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(18085, '127.0.0.1', resolve));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us2-mock-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');

  fs.writeFileSync(envPath, 'INFORMAL_BASE_URL=http://127.0.0.1:18085\nINFORMAL_API_KEY=test-key\n', 'utf8');

  try {
    const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
    await execFileAsync(process.execPath, [scriptPath, '--env-file', envPath, '--iun', iun, '--output-dir', outDir], {
      cwd: path.join(__dirname, '..'),
      env: process.env,
      encoding: 'utf8',
    });

    const summaryCsv = fs.readFileSync(path.join(outDir, 'informal_summary.csv'), 'utf8');
    const eventsCsv = fs.readFileSync(path.join(outDir, 'informal_events.csv'), 'utf8');
    const rawCsv = fs.readFileSync(path.join(outDir, 'informal_timeline_raw.csv'), 'utf8');

    const summary = parseCsv(summaryCsv);
    const events = parseCsv(eventsCsv);
    const raw = parseCsv(rawCsv);
    const rawEvents = raw.rows.map((row) => JSON.parse(row.JSON));

    assert.equal(summary.rows.length, 1, 'summary rows attese = 1');
    assert.deepEqual(summary.header, ['IUN', 'notificationStatus', 'analogCost']);
    assert.equal(summary.rows[0].IUN, iun);
    assert.equal(summary.rows[0].notificationStatus, 'COMPLETED_REACHED');
    assert.equal(summary.rows[0].analogCost, '0');

    assert.equal(events.rows.length, 3, 'event rows attese = 3');
    const analogRow = events.rows.find((r) => r.eventCategory === 'SEND_ANALOG_MESSAGE');
    assert.ok(analogRow, 'manca row SEND_ANALOG_MESSAGE');
    assert.equal(analogRow.analogCost, '227');
    assert.equal(analogRow.numberOfPages, '2');
    assert.equal(analogRow.envelopeWeight, '15');
    assert.equal(analogRow.eventStatus, 'PROCESSING');

    const acceptedRow = events.rows.find((r) => r.eventCategory === 'REQUEST_ACCEPTED');
    assert.ok(acceptedRow, 'manca row REQUEST_ACCEPTED');
    assert.equal(acceptedRow.analogCost, '', 'analogCost deve essere vuoto fuori da SEND_ANALOG_MESSAGE');
    assert.equal(acceptedRow.eventStatus, 'ACCEPTED');

    assert.deepEqual(raw.header, ['IUN', 'TIMELINE_ELEMENT_ID', 'BUSINESS_TIMESTAMP', 'JSON']);
    assert.equal(raw.rows.length, 3, 'raw timeline rows attese = 3');
    assert.equal(raw.rows[0].IUN, iun);
    assert.equal(raw.rows[0].TIMELINE_ELEMENT_ID, `REQUEST_ACCEPTED.IUN_${iun}`);
    assert.equal(raw.rows[0].BUSINESS_TIMESTAMP, '2026-07-21T16:25:27.584650008Z');
    assert.match(rawEvents[0].eventId, /^[0-9a-f-]{36}$/i);
    assert.equal(rawEvents[0].iun, iun);
    assert.equal(rawEvents[0].newStatus, 'ACCEPTED');
    assert.equal(rawEvents[0].notificationRequestId, 'abc');
    assert.deepEqual(rawEvents[0].element, payload.timeline[0]);
    assert.equal(rawEvents[1].newStatus, 'PROCESSING');
    assert.deepEqual(rawEvents[1].element, payload.timeline[1]);
    assert.equal(rawEvents[2].newStatus, 'COMPLETED_REACHED');
    assert.deepEqual(rawEvents[2].element, payload.timeline[2]);

    process.stdout.write('US2 mock test passed\n');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  process.stderr.write(`US2 mock test failed: ${err.stack || err.message}\n`);
  if (err.stderr) {
    process.stderr.write(`stderr: ${err.stderr}\n`);
  }
  process.exit(1);
});
