'use strict';

// dotenv non sovrascrive variabili già presenti nell'ambiente: se il processo
// che esegue i test ereditasse variabili ambientali reali (INFORMAL_*,
// SMTP_*, MAIL_*, AWS_*, ...), il contenuto del .env di test verrebbe
// ignorato silenziosamente, rendendo i test fragili/falsi positivi e
// rischiando chiamate di rete reali invece che verso i server locali fittizi
// usati dai mock test. Per essere esaustivi si usa un allowlist (non un
// denylist, sempre a rischio di dimenticare una variabile) delle sole chiavi
// necessarie a far girare correttamente il processo Node figlio.
const ALLOWED_AMBIENT_ENV_KEYS = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'SystemRoot', 'USERPROFILE'];

function sanitizedBaseEnv() {
  const clean = {};
  for (const key of ALLOWED_AMBIENT_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      clean[key] = process.env[key];
    }
  }
  return clean;
}

/**
 * Ambiente sicuro per spawnare export_informal_csv.js nei mock test: parte da
 * un allowlist minimale (non dall'intero process.env) e vi unisce solo i
 * valori espliciti passati da ciascun test.
 */
function buildChildEnv(extraEnv) {
  return { ...sanitizedBaseEnv(), ...extraEnv };
}

module.exports = { sanitizedBaseEnv, buildChildEnv };
