#!/usr/bin/env node

'use strict';

const path = require('node:path');
const nodemailer = require('nodemailer');

function createSmtpTransporter(transportConfig) {
  return nodemailer.createTransport({
    host: transportConfig.host,
    port: transportConfig.port,
    secure: transportConfig.secure,
    auth: {
      user: transportConfig.user,
      pass: transportConfig.password,
    },
  });
}

/**
 * Crea un transport SES basato sulla default AWS credential provider chain
 * (es. ruolo IAM del CodeBuild). Nessuna credenziale AWS viene letta o gestita
 * qui: region a parte, tutto il resto è delegato all'SDK/ambiente.
 */
function createSesTransporter(transportConfig) {
  const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
  const sesClient = new SESv2Client({ region: transportConfig.region });
  return nodemailer.createTransport({ SES: { sesClient, SendEmailCommand } });
}

function createTransporter(transportConfig) {
  if (transportConfig.provider === 'ses') {
    return createSesTransporter(transportConfig);
  }
  return createSmtpTransporter(transportConfig);
}

function buildSubject(stats) {
  return `[Informal Report] ${stats.processedCount} IUN elaborati — ${stats.generatedAt}`;
}

function buildBody(stats) {
  return [
    `Report generato: ${stats.generatedAt}`,
    `IUN richiesti: ${stats.requestedCount}`,
    `IUN elaborati con successo: ${stats.processedCount}`,
    `Errori: ${stats.errorCount}`,
    '',
    'Righe per file:',
    `- informal_summary.csv: ${stats.processedCount}`,
    `- informal_timeline_raw.csv: ${stats.timelineRawCount}`,
  ].join('\n');
}

function buildAttachments(files) {
  return files.map((filePath) => ({
    filename: path.basename(filePath),
    path: filePath,
  }));
}

/**
 * Invia i CSV generati come allegati via SMTP o AWS SES (in base a `transportConfig.provider`).
 * `transporter` è iniettabile per i test; se omesso viene creato da `transportConfig`.
 */
async function sendReportEmail({ transportConfig, to, files, stats, transporter }) {
  const mailTransporter = transporter ?? createTransporter(transportConfig);

  try {
    await mailTransporter.sendMail({
      from: transportConfig.from,
      to,
      subject: buildSubject(stats),
      text: buildBody(stats),
      attachments: buildAttachments(files),
    });
  } catch (error) {
    const wrapped = new Error(`Invio email fallito: ${error.message}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

module.exports = {
  sendReportEmail,
  createTransporter,
  buildSubject,
  buildBody,
};
