#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const assert = require('node:assert/strict');
const { SMTPServer } = require('smtp-server');

const API_PORT = 18088;
const SMTP_PORT = 18089;
const SMTP_USER = 'test-smtp-user';
const SMTP_PASSWORD = 'test-smtp-password';

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

function startSmtpServer() {
  const received = [];

  const server = new SMTPServer({
    authOptional: false,
    disabledCommands: ['STARTTLS'],
    onAuth(auth, session, callback) {
      if (auth.username === SMTP_USER && auth.password === SMTP_PASSWORD) {
        return callback(null, { user: auth.username });
      }
      return callback(new Error('Invalid credentials'));
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        received.push(Buffer.concat(chunks).toString('utf8'));
        callback();
      });
    },
  });

  return new Promise((resolve) => {
    server.listen(SMTP_PORT, '127.0.0.1', () => resolve({ server, received }));
  });
}

function writeEnv(envPath, extra) {
  const base = [
    `INFORMAL_BASE_URL=http://127.0.0.1:${API_PORT}`,
    'INFORMAL_API_KEY=test-key',
  ];
  fs.writeFileSync(envPath, [...base, ...extra].join('\n') + '\n', 'utf8');
}

function runScript(scriptPath, args, cwd) {
  return execFileAsync(process.execPath, [scriptPath, ...args], { cwd, env: process.env, encoding: 'utf8' });
}

async function testSuccessSendsAllAttachments(scriptPath) {
  const iun = 'TEST-US6-OK';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us6-mock-ok-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');

  writeEnv(envPath, [
    `SMTP_HOST=127.0.0.1`,
    `SMTP_PORT=${SMTP_PORT}`,
    `SMTP_USER=${SMTP_USER}`,
    `SMTP_PASSWORD=${SMTP_PASSWORD}`,
    'SMTP_FROM=noreply@example.test',
    'SMTP_SECURE=false',
  ]);

  const { received } = await startSmtpServerTracked();

  const result = await runScript(
    scriptPath,
    ['--iun', iun, '--mail', 'dest@example.test', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..')
  );

  assert.equal(result.error, null, `lo script non deve fallire sul caso di successo: ${result.stderr}`);
  assert.match(result.stdout, /Report inviato via email a dest@example\.test/);
  assert.equal(received.length, 1, 'il server SMTP deve ricevere esattamente 1 messaggio');

  const message = received[0];
  const expectedFiles = [
    'informal_summary.csv',
    'informal_events.csv',
    'informal_timeline_raw.csv',
    'informal_attachments.csv',
    'informal_errors.csv',
  ];
  for (const filename of expectedFiles) {
    assert.match(message, new RegExp(`filename="?${filename}"?`), `allegato mancante: ${filename}`);
  }

  for (const filename of expectedFiles) {
    assert(fs.existsSync(path.join(outDir, filename)), `file atteso su disco: ${filename}`);
  }
}

async function testInvalidEmailFailsBeforeExport(scriptPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us6-mock-badmail-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');
  writeEnv(envPath, []);

  const result = await runScript(
    scriptPath,
    ['--iun', 'TEST-US6-BADMAIL', '--mail', 'not-an-email', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..')
  );

  assert.notEqual(result.error, null, 'lo script deve fallire con indirizzo email non valido');
  assert.match(result.stderr, /Indirizzo email non valido/);
  assert.equal(fs.existsSync(outDir), false, 'nessun CSV deve essere generato: la validazione fallisce prima dell\'export');
}

async function testMissingSmtpEnvFailsFast(scriptPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us6-mock-noenv-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');
  writeEnv(envPath, []);

  const result = await runScript(
    scriptPath,
    ['--iun', 'TEST-US6-NOENV', '--mail', 'dest@example.test', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..')
  );

  assert.notEqual(result.error, null, 'lo script deve fallire fail-fast se mancano le variabili SMTP');
  assert.match(result.stderr, /richiede la configurazione SMTP/);
  assert.equal(fs.existsSync(outDir), false, 'nessuna chiamata API/export deve avvenire se la config SMTP e\' incompleta');
}

async function testSmtpFailureKeepsFilesOnDisk(scriptPath) {
  const iun = 'TEST-US6-SMTPFAIL';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us6-mock-smtpfail-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');

  writeEnv(envPath, [
    'SMTP_HOST=127.0.0.1',
    'SMTP_PORT=18090',
    'SMTP_USER=user',
    'SMTP_PASSWORD=pass',
    'SMTP_FROM=noreply@example.test',
    'SMTP_SECURE=false',
  ]);

  const result = await runScript(
    scriptPath,
    ['--iun', iun, '--mail', 'dest@example.test', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..')
  );

  assert.notEqual(result.error, null, 'lo script deve terminare con errore se il server SMTP non e\' raggiungibile');
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

let smtpServerHandle;

async function startSmtpServerTracked() {
  smtpServerHandle = await startSmtpServer();
  return smtpServerHandle;
}

async function run() {
  const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
  const apiServer = await startApiServer();

  try {
    await testSuccessSendsAllAttachments(scriptPath);
    await testInvalidEmailFailsBeforeExport(scriptPath);
    await testMissingSmtpEnvFailsFast(scriptPath);
    await testSmtpFailureKeepsFilesOnDisk(scriptPath);

    process.stdout.write('US6 mock test passed\n');
  } finally {
    apiServer.close();
    if (smtpServerHandle) {
      smtpServerHandle.server.close();
    }
  }
}

run().catch((err) => {
  process.stderr.write(`US6 mock test failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
