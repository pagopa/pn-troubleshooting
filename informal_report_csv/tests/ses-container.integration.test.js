#!/usr/bin/env node
'use strict';

/**
 * Test di integrazione: verifica la connettività reale verso un servizio
 * SES-compatibile in esecuzione in un container Docker (`aws-ses-v2-local`).
 *
 * A differenza di `us7.mock.test.js` (che intercetta le chiamate SESv2 con un
 * server HTTP fittizio in-process, senza validare il formato reale delle
 * richieste), qui `export_informal_csv.js` parla davvero via rete con
 * un'implementazione dell'API SESv2 che valida/risponde come farebbe AWS SES,
 * catturando problemi di wiring (endpoint, region, formato MIME/allegati) che
 * un fake troppo permissivo non potrebbe rilevare.
 *
 * Copre inoltre uno scenario di perdita di connettività "reale": il container
 * viene arrestato mentre il test è in corso e si verifica che lo script fallisca
 * correttamente (a differenza di us7, che punta sempre a una porta mai aperta).
 *
 * Non incluso in `npm run test:mock` (richiede Docker + pull di un'immagine):
 * va eseguito esplicitamente con `npm run test:container:ses`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const assert = require('node:assert/strict');
const { buildChildEnv } = require('./testEnv');

const CONTAINER_IMAGE = 'dasprid/aws-ses-v2-local:latest';
const CONTAINER_NAME = `pn-informal-ses-container-test-${process.pid}`;
const API_PORT = 18120;
const SES_CONTAINER_PORT = 18121;
const AWS_REGION = 'eu-south-1';

// Credenziali AWS statiche fittizie: aws-ses-v2-local non valida le firme SigV4,
// servono solo a evitare che l'SDK tenti di risolvere credenziali reali (IMDS,
// profili locali, ...) rallentando/bloccando il test.
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

function requireManualTrigger(argv) {
  if (!argv.includes('--run-container-e2e')) {
    throw new Error(
      'Test container SES bloccato: eseguire esplicitamente con --run-container-e2e ' +
      '(richiede Docker); usa "npm run test:container:ses". Vedi README.'
    );
  }
  if (process.env.CI === 'true' && !argv.includes('--allow-ci-container-e2e')) {
    throw new Error('Test container SES bloccato in CI: richiede Docker disponibile sul runner.');
  }
}

async function ensureDockerAvailable() {
  const result = await execFileAsync('docker', ['info']);
  if (result.error) {
    throw new Error(
      'Docker non disponibile: assicurati che il daemon Docker sia avviato ' +
      '(Docker Desktop/Rancher Desktop/colima, ...) per eseguire questo test.\n' +
      (result.stderr || result.error.message)
    );
  }
}

function waitForHttpOk(url, { retries = 40, delayMs = 250 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryOnce = () => {
      attempt += 1;
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (attempt >= retries) {
          reject(new Error(`Endpoint ${url} non pronto dopo ${retries} tentativi (status=${res.statusCode})`));
        } else {
          setTimeout(tryOnce, delayMs);
        }
      });
      req.on('error', () => {
        if (attempt >= retries) {
          reject(new Error(`Endpoint ${url} irraggiungibile dopo ${retries} tentativi`));
        } else {
          setTimeout(tryOnce, delayMs);
        }
      });
    };
    tryOnce();
  });
}

async function removeContainerIfPresent() {
  // Pulizia best-effort di eventuali container residui da run precedenti interrotti.
  await execFileAsync('docker', ['rm', '-f', CONTAINER_NAME]);
}

async function startSesContainer() {
  await removeContainerIfPresent();

  const run = await execFileAsync('docker', [
    'run', '-d', '--rm',
    '--name', CONTAINER_NAME,
    '-p', `${SES_CONTAINER_PORT}:8005`,
    CONTAINER_IMAGE,
  ]);

  if (run.error) {
    throw new Error(`Avvio container SES fallito: ${run.stderr || run.error.message}`);
  }

  await waitForHttpOk(`http://127.0.0.1:${SES_CONTAINER_PORT}/health-check`);
}

async function stopSesContainer() {
  await execFileAsync('docker', ['rm', '-f', CONTAINER_NAME]);
}

async function fetchStoredEmails() {
  const response = await fetch(`http://127.0.0.1:${SES_CONTAINER_PORT}/store`);
  if (!response.ok) {
    throw new Error(`GET /store fallita con status ${response.status}`);
  }
  return response.json();
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

async function testContainerReachableSendSucceeds(scriptPath) {
  const iun = 'TEST-SES-CONTAINER-OK';
  const to = 'dest+container-ok@example.test';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ses-container-ok-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');

  writeSesEnv(envPath, [
    `AWS_REGION=${AWS_REGION}`,
    'MAIL_FROM=noreply@example.test',
  ]);

  const result = await runScript(
    scriptPath,
    ['--iun', iun, '--mail', to, '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..'),
    { AWS_ENDPOINT_URL_SESV2: `http://127.0.0.1:${SES_CONTAINER_PORT}` }
  );

  assert.equal(result.error, null, `lo script non deve fallire quando il container SES è raggiungibile: ${result.stderr}`);
  assert.match(result.stdout, new RegExp(`Report inviato via email a ${to.replace(/[.+]/g, '\\$&')}`));

  const expectedFiles = [
    'informal_summary.csv',
    'informal_events.csv',
    'informal_timeline_raw.csv',
    'informal_attachments.csv',
    'informal_errors.csv',
  ];
  for (const filename of expectedFiles) {
    assert(fs.existsSync(path.join(outDir, filename)), `file atteso su disco: ${filename}`);
  }

  const store = await fetchStoredEmails();
  const received = store.emails.filter((email) => email.destination.to.includes(to));
  assert.equal(received.length, 1, 'il container SES deve aver ricevuto esattamente 1 email per questo destinatario');
  assert.equal(received[0].attachments.length, expectedFiles.length, 'il numero di allegati ricevuti dal container deve corrispondere ai CSV generati');
  const receivedFilenames = received[0].attachments.map((a) => a.filename).sort();
  assert.deepEqual(receivedFilenames, [...expectedFiles].sort(), 'i nomi degli allegati ricevuti dal container devono corrispondere');
}

async function testContainerStoppedFailsWithConnectivityError(scriptPath) {
  const iun = 'TEST-SES-CONTAINER-DOWN';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ses-container-down-'));
  const envPath = path.join(tempDir, '.env');
  const outDir = path.join(tempDir, 'out');

  writeSesEnv(envPath, [
    `AWS_REGION=${AWS_REGION}`,
    'MAIL_FROM=noreply@example.test',
  ]);

  // Il container è stato arrestato dal chiamante prima di questa chiamata:
  // simula una perdita di connettività reale verso un servizio che era
  // effettivamente raggiungibile un istante prima (non una porta mai aperta).
  const result = await runScript(
    scriptPath,
    ['--iun', iun, '--mail', 'dest@example.test', '--env-file', envPath, '--output-dir', outDir],
    path.join(__dirname, '..'),
    { AWS_ENDPOINT_URL_SESV2: `http://127.0.0.1:${SES_CONTAINER_PORT}` }
  );

  assert.notEqual(result.error, null, 'lo script deve fallire quando il container SES non è più raggiungibile');
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
    assert(fs.existsSync(path.join(outDir, filename)), `file atteso su disco anche con connettività SES persa: ${filename}`);
  }
}

async function run() {
  const argv = process.argv.slice(2);
  requireManualTrigger(argv);
  await ensureDockerAvailable();

  const scriptPath = path.join(__dirname, '..', 'export_informal_csv.js');
  const apiServer = await startApiServer();

  try {
    await startSesContainer();
    await testContainerReachableSendSucceeds(scriptPath);

    await stopSesContainer();
    await testContainerStoppedFailsWithConnectivityError(scriptPath);

    process.stdout.write('SES container integration test passed\n');
  } finally {
    apiServer.close();
    await removeContainerIfPresent();
  }
}

run().catch((err) => {
  process.stderr.write(`SES container integration test failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
