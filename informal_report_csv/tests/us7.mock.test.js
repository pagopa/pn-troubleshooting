#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const assert = require('node:assert/strict');
const { buildChildEnv } = require('./testEnv');

const API_PORT = 18098;
const SES_PORT = 18099;
const SES_UNREACHABLE_PORT = 18100;
const AWS_REGION = 'eu-south-1';

// Credenziali AWS statiche fittizie: servono solo a soddisfare la default
// credential provider chain dell'SDK durante il test (nessuna chiamata AWS
// reale avviene: l'endpoint è reindirizzato via AWS_ENDPOINT_URL_SESV2 verso
// il server SESv2 fittizio avviato qui sotto).
const FAKE_AWS_ENV = {
  AWS_ACCESS_KEY_ID: 'FAKEACCESSKEYIDTEST0',
  AWS_SECRET_ACCESS_KEY: 'FakeSecretAccessKeyForTestsOnly1234567890',
};

function execFileAsync(cmd, args, options) {
  return new Promise((resolve) => {
    execFile(cmd, args, options, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr, exitCode: error ? error.code : 0 });
    });
  });
}

function payloadFor(iun) {
  return {
    iun,
    notificationStatus: 'COMPLETED_REACHED',
    notificationStatusHistory: [],
    timeline: [],
    documents: [],
  };
}

function startApiServer() {
  const server = http.createServer((req, res) => {
    const match = req.url.match(/^\/informal\/delivery\/v1\/notifications\/sent\/([^?]+)\?retrieveMessage=true$/);
    if (!match) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    const iun = decodeURIComponent(match[1]);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payloadFor(iun)));
  });

  return new Promise((resolve) => {
    server.listen(API_PORT, '127.0.0.1', () => resolve(server));
  });
}

/**
 * Server HTTP fittizio che simula l'endpoint SESv2 SendEmail: risponde con un
 * MessageId fittizio e cattura il body grezzo di ogni richiesta ricevuta.
 */
function startSesServer() {
  const received = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received.push(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ MessageId: 'fake-message-id' }));
    });
  });

  return new Promise((resolve) => {
    server.listen(SES_PORT, '127.0.0.1', () => resolve({ server, received }));
  });
}

/**
 * Estrae il messaggio MIME grezzo dal body JSON catturato di una richiesta
 * SESv2 SendEmail (Content.Raw.Data è codificato base64).
 */
function decodeRawMimeFromSesRequestBody(rawBody) {
  const payload = JSON.parse(rawBody);
  const base64Data = payload.Content.Raw.Data;
  return Buffer.from(base64Data, 'base64').toString('utf8');
}

function writeSesEnv(envPath, extra) {
  const base = [
    `INFORMAL_BASE_URL=http://127.0.0.1:${API_PORT}`,
    'INFORMAL_API_KEY=test-key',
    'MAIL_PROVIDER=ses',
  ];
  fs.writeFileSync(envPath, [...base, ...extra].join('\n') + '\n', 'utf8');
}

function runScript(scriptPath, args, cwd, extraEnv) {
  return execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: buildChildEnv({ ...FAKE_AWS_ENV, ...extraEnv }),
    encoding: 'utf8',
  });
}

async function testSuccessSendsAllAttachments(scriptPath) {
  const iun = 'TEST-US7-OK';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us7-mock-ok-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');

  writeSesEnv(envPath, [
    `AWS_REGION=${AWS_REGION}`,
    'MAIL_FROM=noreply@example.test',
  ]);

  const { received } = await startSesServerTracked();

  const result = await runScript(
    scriptPath,
    ['--iun', iun, '--mail', 'dest@example.test', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..'),
    { AWS_ENDPOINT_URL_SESV2: `http://127.0.0.1:${SES_PORT}` }
  );

  assert.equal(result.error, null, `lo script non deve fallire sul caso di successo: ${result.stderr}`);
  assert.match(result.stdout, /Report inviato via email a dest@example\.test/);
  assert.equal(received.length, 1, 'il server SESv2 deve ricevere esattamente 1 richiesta SendEmail');

  const rawMime = decodeRawMimeFromSesRequestBody(received[0]);
  const expectedFiles = [
    'informal_summary.csv',
    'informal_events.csv',
    'informal_timeline_raw.csv',
    'informal_attachments.csv',
    'informal_errors.csv',
  ];
  for (const filename of expectedFiles) {
    assert.match(rawMime, new RegExp(`filename="?${filename}"?`), `allegato mancante: ${filename}`);
  }

  for (const filename of expectedFiles) {
    assert(fs.existsSync(path.join(outDir, filename)), `file atteso su disco: ${filename}`);
  }
}

async function testInvalidEmailFailsBeforeExport(scriptPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us7-mock-badmail-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');
  writeSesEnv(envPath, []);

  const result = await runScript(
    scriptPath,
    ['--iun', 'TEST-US7-BADMAIL', '--mail', 'not-an-email', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..')
  );

  assert.notEqual(result.error, null, 'lo script deve fallire con indirizzo email non valido');
  assert.match(result.stderr, /Indirizzo email non valido/);
  assert.equal(fs.existsSync(outDir), false, 'nessun CSV deve essere generato: la validazione fallisce prima dell\'export');
}

async function testMissingSesEnvFailsFast(scriptPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us7-mock-noenv-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');
  writeSesEnv(envPath, []);

  const result = await runScript(
    scriptPath,
    ['--iun', 'TEST-US7-NOENV', '--mail', 'dest@example.test', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..')
  );

  assert.notEqual(result.error, null, 'lo script deve fallire fail-fast se mancano le variabili SES');
  assert.match(result.stderr, /richiede la configurazione SES/);
  assert.match(result.stderr, /AWS_REGION/);
  assert.match(result.stderr, /MAIL_FROM/);
  assert.equal(fs.existsSync(outDir), false, 'nessuna chiamata API/export deve avvenire se la config SES e\' incompleta');
}

async function testSesFailureKeepsFilesOnDisk(scriptPath) {
  const iun = 'TEST-US7-SESFAIL';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us7-mock-sesfail-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');

  writeSesEnv(envPath, [
    `AWS_REGION=${AWS_REGION}`,
    'MAIL_FROM=noreply@example.test',
  ]);

  const result = await runScript(
    scriptPath,
    ['--iun', iun, '--mail', 'dest@example.test', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..'),
    // nessun server in ascolto su questa porta: simula l'endpoint SES irraggiungibile
    { AWS_ENDPOINT_URL_SESV2: `http://127.0.0.1:${SES_UNREACHABLE_PORT}` }
  );

  assert.notEqual(result.error, null, 'lo script deve terminare con errore se l\'endpoint SES non e\' raggiungibile');
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /I CSV generati restano disponibili/);

  const expectedFiles = [
    'informal_summary.csv',
    'informal_events.csv',
    'informal_timeline_raw.csv',
    'informal_attachments.csv',
    'informal_errors.csv',
  ];
  for (const filename of expectedFiles) {
    assert(fs.existsSync(path.join(outDir, filename)), `file atteso su disco anche con invio fallito: ${filename}`);
  }
}

let sesServerHandle;

async function startSesServerTracked() {
  sesServerHandle = await startSesServer();
  return sesServerHandle;
}

async function run() {
  const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
  const apiServer = await startApiServer();

  try {
    await testSuccessSendsAllAttachments(scriptPath);
    await testInvalidEmailFailsBeforeExport(scriptPath);
    await testMissingSesEnvFailsFast(scriptPath);
    await testSesFailureKeepsFilesOnDisk(scriptPath);

    process.stdout.write('US7 mock test passed\n');
  } finally {
    apiServer.close();
    if (sesServerHandle) {
      sesServerHandle.server.close();
    }
  }
}

run().catch((err) => {
  process.stderr.write(`US7 mock test failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
