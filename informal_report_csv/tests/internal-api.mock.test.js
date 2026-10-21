#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const assert = require('node:assert/strict');
const { buildChildEnv } = require('./testEnv');

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
  const iun = 'TEST-INTERNAL-IUN';
  const expectedHeaders = {
    uid: 'test-user',
    cxType: 'PA',
    cxId: 'test-pa',
    cxGroups: 'group1,group2',
  };
  const server = http.createServer((req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, `/delivery/v1/notifications/sent/${iun}`);
    assert.equal(req.headers['x-pagopa-pn-uid'], expectedHeaders.uid);
    assert.equal(req.headers['x-pagopa-pn-cx-type'], expectedHeaders.cxType);
    assert.equal(req.headers['x-pagopa-pn-cx-id'], expectedHeaders.cxId);
    assert.equal(req.headers['x-pagopa-pn-cx-groups'], expectedHeaders.cxGroups);
    assert.equal(req.headers['x-api-key'], undefined);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      iun,
      notificationStatus: 'ACCEPTED',
      notificationStatusHistory: [],
      timeline: [],
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-api-mock-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');
  const { port } = server.address();
  fs.writeFileSync(envPath, [
    'INFORMAL_API_MODE=internal',
    `INFORMAL_INTERNAL_BASE_URL=http://127.0.0.1:${port}`,
    `INFORMAL_INTERNAL_UID=${expectedHeaders.uid}`,
    `INFORMAL_INTERNAL_CX_TYPE=${expectedHeaders.cxType}`,
    `INFORMAL_INTERNAL_CX_ID=${expectedHeaders.cxId}`,
    `INFORMAL_INTERNAL_CX_GROUPS=${expectedHeaders.cxGroups}`,
    '',
  ].join('\n'), 'utf8');

  try {
    const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
    await execFileAsync(
      process.execPath,
      [scriptPath, '--env-file', envPath, '--iun', iun, '--output-dir', outDir],
      {
        cwd: path.join(__dirname, '..'),
        env: buildChildEnv(),
        encoding: 'utf8',
      }
    );

    const summaryCsv = fs.readFileSync(path.join(outDir, 'informal_summary.csv'), 'utf8');
    assert.match(summaryCsv, new RegExp(`"${iun}","ACCEPTED","0"`));
    process.stdout.write('Internal API mock test passed\n');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  process.stderr.write(`Internal API mock test failed: ${err.stack || err.message}\n`);
  if (err.stderr) {
    process.stderr.write(`stderr: ${err.stderr}\n`);
  }
  process.exit(1);
});
