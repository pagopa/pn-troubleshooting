#!/usr/bin/env node
'use strict';

// Test di retrocompatibilità PN-21466: gli eventi ricevuti come PREPARE_ANALOG_DELIVERY
// devono essere riportati in output come PREPARE_ANALOG_MESSAGE (category, elementId,
// TIMELINE_ELEMENT_ID, eventDescription, newStatus lookup). Gli eventi già
// PREPARE_ANALOG_MESSAGE devono restare inalterati.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const assert = require('node:assert/strict');
const { buildChildEnv } = require('./testEnv');

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
  const iun = 'TEST-PN21466-IUN';
  const payload = {
    iun,
    notificationStatus: 'COMPLETED_REACHED',
    notificationStatusHistory: [
      {
        status: 'PROCESSING',
        activeFrom: '2026-07-21T16:34:59.670716450Z',
        relatedTimelineElements: [`PREPARE_ANALOG_DELIVERY.IUN_${iun}.RECINDEX_0.ATTEMPT_0`],
      },
      {
        status: 'COMPLETED_REACHED',
        activeFrom: '2026-07-21T16:39:51.676484175Z',
        relatedTimelineElements: [`PREPARE_ANALOG_MESSAGE.IUN_${iun}.RECINDEX_1.ATTEMPT_0`],
      },
    ],
    timeline: [
      {
        // Evento rinominato: deve essere riportato come PREPARE_ANALOG_MESSAGE
        elementId: `PREPARE_ANALOG_DELIVERY.IUN_${iun}.RECINDEX_0.ATTEMPT_0`,
        eventTimestamp: '2026-07-21T16:30:00.000000000Z',
        category: 'PREPARE_ANALOG_DELIVERY',
        details: {
          recIndex: 0,
          prepareRequestId: `pn-cons-000~PREPARE_ANALOG_DELIVERY.IUN_${iun}.RECINDEX_0.ATTEMPT_0`,
          note: `Evento sorgente PREPARE_ANALOG_DELIVERY per ${iun}`,
          nested: {
            relatedIds: [
              `PREPARE_ANALOG_DELIVERY.IUN_${iun}.RECINDEX_0.ATTEMPT_0`,
              `unchanged-PREPARE_ANALOG_MESSAGE-IUN_${iun}`,
            ],
          },
        },
      },
      {
        // Evento già rinominato: deve restare inalterato
        elementId: `PREPARE_ANALOG_MESSAGE.IUN_${iun}.RECINDEX_1.ATTEMPT_0`,
        eventTimestamp: '2026-07-21T16:31:00.000000000Z',
        category: 'PREPARE_ANALOG_MESSAGE',
        details: { recIndex: 1 },
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

  await new Promise((resolve) => server.listen(18086, '127.0.0.1', resolve));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pn21466-mock-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');

  fs.writeFileSync(envPath, 'INFORMAL_BASE_URL=http://127.0.0.1:18086\nINFORMAL_API_KEY=test-key\n', 'utf8');

  try {
    const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
    await execFileAsync(process.execPath, [scriptPath, '--env-file', envPath, '--iun', iun, '--output-dir', outDir], {
      cwd: path.join(__dirname, '..'),
      env: buildChildEnv(),
      encoding: 'utf8',
    });

    const rawCsv = fs.readFileSync(path.join(outDir, 'informal_timeline_raw.csv'), 'utf8');
    const raw = parseCsv(rawCsv);
    const rawEvents = raw.rows.map((row) => JSON.parse(row.JSON));

    assert.equal(raw.rows.length, 2, 'raw timeline rows attese = 2');

    // Evento rinominato: TIMELINE_ELEMENT_ID, elementId, category ed eventDescription
    // devono usare PREPARE_ANALOG_MESSAGE.
    const expectedRenamedElementId = `PREPARE_ANALOG_MESSAGE.IUN_${iun}.RECINDEX_0.ATTEMPT_0`;
    assert.equal(raw.rows[0].TIMELINE_ELEMENT_ID, expectedRenamedElementId);
    assert.equal(rawEvents[0].informalElement.elementId, expectedRenamedElementId);
    assert.equal(rawEvents[0].informalElement.category, 'PREPARE_ANALOG_MESSAGE');
    assert.equal(
      rawEvents[0].informalElement.details.prepareRequestId,
      `pn-cons-000~PREPARE_ANALOG_MESSAGE.IUN_${iun}.RECINDEX_0.ATTEMPT_0`
    );
    assert.equal(rawEvents[0].informalElement.details.note, `Evento sorgente PREPARE_ANALOG_MESSAGE per ${iun}`);
    assert.deepEqual(rawEvents[0].informalElement.details.nested.relatedIds, [
      `PREPARE_ANALOG_MESSAGE.IUN_${iun}.RECINDEX_0.ATTEMPT_0`,
      `unchanged-PREPARE_ANALOG_MESSAGE-IUN_${iun}`,
    ]);
    assert.equal(
      rawEvents[0].eventDescription,
      `${payload.timeline[0].eventTimestamp}_${expectedRenamedElementId}`
    );
    assert.equal(rawEvents[0].newStatus, 'PROCESSING', 'newStatus lookup deve funzionare dopo la rinomina');

    // Evento già rinominato: nessuna modifica.
    const expectedAlreadyRenamedElementId = `PREPARE_ANALOG_MESSAGE.IUN_${iun}.RECINDEX_1.ATTEMPT_0`;
    assert.equal(raw.rows[1].TIMELINE_ELEMENT_ID, expectedAlreadyRenamedElementId);
    assert.equal(rawEvents[1].informalElement.elementId, expectedAlreadyRenamedElementId);
    assert.equal(rawEvents[1].informalElement.category, 'PREPARE_ANALOG_MESSAGE');
    assert.equal(rawEvents[1].newStatus, 'COMPLETED_REACHED');

    console.log('PN-21466 mock test passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
