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
  const okIun = 'TEST-US3-OK';
  const koIun = 'TEST-US3-KO';

  const okPayload = {
    iun: okIun,
    documentsAvailable: true,
    notificationStatus: 'COMPLETED_REACHED',
    notificationStatusHistory: [
      {
        status: 'PROCESSING',
        activeFrom: '2026-07-21T16:34:59.670716450Z',
        relatedTimelineElements: [`SEND_ANALOG_MESSAGE_PROGRESS.IUN_${okIun}.RECINDEX_0.IDX_1`],
      },
    ],
    timeline: [
      {
        elementId: `SEND_ANALOG_MESSAGE_PROGRESS.IUN_${okIun}.RECINDEX_0.IDX_1`,
        category: 'SEND_ANALOG_MESSAGE_PROGRESS',
        eventTimestamp: '2026-07-21T16:37:34Z',
        details: {
          recIndex: 0,
          attachments: [
            {
              id: '0',
              documentType: 'Copia Conforme AAR',
              url: 'safestorage://ATTACHMENT-1.pdf',
            },
          ],
        },
      },
    ],
    documents: [
      {
        docIdx: '0',
        contentType: 'application/pdf',
        ref: { key: 'PN_COMMUNICATIONS_ATTACHMENT-AAA.pdf' },
      },
    ],
  };

  const expectedNotificationRequestId = Buffer.from(okIun, 'utf8').toString('base64');

  const server = http.createServer((req, res) => {
    if (req.url === `/informal/delivery/v1/notifications/sent/${okIun}?retrieveMessage=true`) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(okPayload));
      return;
    }
    if (req.url === `/informal/delivery/v1/notifications/sent/${koIun}?retrieveMessage=true`) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'unexpected' }));
  });

  await new Promise((resolve) => server.listen(18086, '127.0.0.1', resolve));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us3-mock-'));
  const envPath = path.join(tempDir, '.env');
  const inputPath = path.join(tempDir, 'iuns.txt');
  const outDir = path.join(tempDir, 'out');

  fs.writeFileSync(envPath, 'INFORMAL_BASE_URL=http://127.0.0.1:18086\nINFORMAL_API_KEY=test-key\n', 'utf8');
  fs.writeFileSync(inputPath, `${okIun}\n${koIun}\n${okIun}\n\n`, 'utf8');

  try {
    const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
    const result = await execFileAsync(
      process.execPath,
      [scriptPath, '--env-file', envPath, '--input-file', inputPath, '--output-dir', outDir],
      { cwd: path.join(__dirname, '..'), env: process.env, encoding: 'utf8' }
    );

    assert.ok(result.error, 'con un IUN KO lo script deve terminare con exit code != 0');

    const summaryCsv = fs.readFileSync(path.join(outDir, 'informal_summary.csv'), 'utf8');
    const eventsCsv = fs.readFileSync(path.join(outDir, 'informal_events.csv'), 'utf8');
    const rawCsv = fs.readFileSync(path.join(outDir, 'informal_timeline_raw.csv'), 'utf8');
    const attachmentsCsv = fs.readFileSync(path.join(outDir, 'informal_attachments.csv'), 'utf8');
    const errorsCsv = fs.readFileSync(path.join(outDir, 'informal_errors.csv'), 'utf8');

    const summary = parseCsv(summaryCsv);
    const events = parseCsv(eventsCsv);
    const raw = parseCsv(rawCsv);
    const rawEvent = JSON.parse(raw.rows[0].JSON);
    const attachments = parseCsv(attachmentsCsv);
    const errors = parseCsv(errorsCsv);

    assert.equal(summary.rows.length, 1, 'summary deve contenere solo IUN OK deduplicato');
    assert.deepEqual(summary.header, ['IUN', 'notificationStatus', 'analogCost']);
    assert.equal(summary.rows[0].IUN, okIun);
    assert.equal(summary.rows[0].analogCost, '0');

    assert.equal(events.rows.length, 1, 'events deve contenere solo timeline di IUN OK');
    assert.equal(raw.rows.length, 1, 'raw timeline deve contenere solo timeline di IUN OK');
    assert.match(rawEvent.eventId, /^[0-9a-f-]{36}$/i);
    assert.equal(rawEvent.iun, okIun);
    assert.equal(rawEvent.notificationRequestId, expectedNotificationRequestId);
    assert.equal(rawEvent.ttl, 1);
    assert.equal(rawEvent.eventDescription, `${okPayload.timeline[0].eventTimestamp}_${okPayload.timeline[0].elementId}`);
    assert.equal(rawEvent.newStatus, 'PROCESSING');
    assert.deepEqual(rawEvent.element, okPayload.timeline[0]);

    assert.equal(attachments.rows.length, 2, 'attachments deve contenere document + timeline attachment');
    const docRow = attachments.rows.find((r) => r.attachmentType === 'DOCUMENT');
    const attRow = attachments.rows.find((r) => r.attachmentType === 'ATTACHMENT');
    assert.ok(docRow, 'manca riga DOCUMENT');
    assert.ok(attRow, 'manca riga ATTACHMENT');
    assert.equal(docRow.iun, okIun);
    assert.equal(attRow.iun, okIun);

    assert.equal(errors.rows.length, 1, 'errori deve contenere solo IUN KO');
    assert.equal(errors.rows[0].iun, koIun);
    assert.equal(errors.rows[0].errorType, 'HTTP_404');

    process.stdout.write('US3 mock test passed\n');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  process.stderr.write(`US3 mock test failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
