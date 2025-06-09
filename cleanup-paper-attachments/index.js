const S3Service = require('./service/S3Service');
const cliProgress = require('cli-progress');
const { ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

// Parsing degli argomenti da linea di comando
function parseArguments() {
  const args = process.argv.slice(2);
  const config = {
    awsProfile: null,
    awsRegion: null,
    bucketName: null,
    retentionDays: 120,
    prefixFilter: 'PN_PAPER_ATTACHMENT',
    limit: -1,
    localstackEndpoint: null,
    dryRun: false,
    help: false,
    logFile: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--aws-profile':
        config.awsProfile = nextArg;
        i++;
        break;
      case '--aws-region':
        config.awsRegion = nextArg;
        i++;
        break;
      case '--bucket-name':
        config.bucketName = nextArg;
        i++;
        break;
      case '--retention-days':
        config.retentionDays = parseInt(nextArg);
        i++;
        break;
      case '--prefix-filter':
        config.prefixFilter = nextArg;
        i++;
        break;
      case '--limit':
        config.limit = parseInt(nextArg);
        i++;
        break;
      case '--localstack-endpoint':
        config.localstackEndpoint = nextArg;
        i++;
        break;
      case '--log-file':
        config.logFile = nextArg;
        i++;
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--help':
        config.help = true;
        break;
    }
  }

  return config;
}

function showHelp() {
  console.log(`
📚 CLEANUP PAPER ATTACHMENTS - Guida all'uso
==================================================================

Uso: node index.js [OPZIONI]

OPZIONI OBBLIGATORIE:
  --aws-profile <profilo>     Profilo AWS da utilizzare
  --aws-region <regione>      Regione AWS (es: eu-central-1)
  --bucket-name <nome>        Nome del bucket S3

OPZIONI FACOLTATIVE:
  --retention-days <giorni>   Giorni di retention (default: 120)
  --prefix-filter <prefisso>  Prefisso oggetti da filtrare (default: PN_PAPER_ATTACHMENT)
  --limit <numero>            Limite oggetti da eliminare (default: -1, nessun limite)
  --localstack-endpoint <url> Endpoint LocalStack per test locali
  --log-file <percorso>       File di log per tracciare le eliminazioni (default: cleanup-log-TIMESTAMP.txt)
  --dry-run                   Modalità simulazione (nessuna eliminazione)
  --help                      Mostra questa guida

ESEMPI:

# Esecuzione base (produzione)
node index.js --aws-profile mio-profilo --aws-region eu-central-1 --bucket-name mio-bucket

# Con retention personalizzata e limite
node index.js --aws-profile mio-profilo --aws-region eu-central-1 --bucket-name mio-bucket --retention-days 90 --limit 100

# Modalità dry-run per test
node index.js --aws-profile mio-profilo --aws-region eu-central-1 --bucket-name mio-bucket --dry-run

# Test con LocalStack
node index.js --aws-profile localstack --aws-region eu-central-1 --bucket-name test-bucket --localstack-endpoint http://localhost:4566

# Prefisso personalizzato con log
node index.js --aws-profile mio-profilo --aws-region eu-central-1 --bucket-name mio-bucket --prefix-filter CUSTOM_PREFIX --log-file ./my-cleanup.log
`);
}

function validateConfig(config) {
  const required = ['awsProfile', 'awsRegion', 'bucketName'];
  const missing = required.filter(field => !config[field]);
  
  if (missing.length > 0) {
    console.error(`❌ Parametri obbligatori mancanti: ${missing.map(f => '--' + f.replace(/([A-Z])/g, '-$1').toLowerCase()).join(', ')}`);
    console.error('Usa --help per la guida completa.');
    return false;
  }

  if (isNaN(config.retentionDays) || config.retentionDays < 0) {
    console.error('❌ --retention-days deve essere un numero positivo');
    return false;
  }

  if (isNaN(config.limit)) {
    console.error('❌ --limit deve essere un numero (-1 per nessun limite)');
    return false;
  }

  return true;
}

function initializeLog(config) {
  // Genera nome file di log se non specificato
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const defaultLogFile = `cleanup-log-${timestamp}.txt`;
  const logFile = config.logFile || defaultLogFile;
  
  // Crea la cartella logs se non esiste
  const logDir = path.dirname(logFile);
  if (logDir !== '.' && !fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Scrive l'intestazione del log
  const header = `CLEANUP PAPER ATTACHMENTS - ESECUZIONE
========================================================
Timestamp: ${new Date().toISOString()}
AWS Profile: ${config.awsProfile}
AWS Region: ${config.awsRegion}
Bucket: ${config.bucketName}
Prefisso: ${config.prefixFilter}
Retention Days: ${config.retentionDays}
Limite: ${config.limit === -1 ? 'Nessuno' : config.limit}
Modalità: ${config.dryRun ? 'DRY RUN' : 'REALE'}
${config.localstackEndpoint ? `LocalStack: ${config.localstackEndpoint}` : ''}
========================================================

`;

  fs.writeFileSync(logFile, header);
  return logFile;
}

function writeLogSummary(logFile, totalScanned, deletedFiles) {
  const summary = `
RIEPILOGO:
Totale file scansionati: ${totalScanned}
Totale file eliminati: ${deletedFiles.length}

FILE ELIMINATI:
${deletedFiles.length > 0 ? deletedFiles.map(file => `- ${file}`).join('\n') : 'Nessun file eliminato'}
`;

  fs.appendFileSync(logFile, summary);
}

const progressBar = new cliProgress.SingleBar({
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
});

function getObjectAgeDays(lastModified) {
  const today = new Date();
  return Math.floor((today - new Date(lastModified)) / (1000 * 60 * 60 * 24));
}

async function listObjectsWithPrefix(s3Service, bucketName, prefixFilter) {
  let continuationToken = undefined;
  const allObjects = [];

  do {
    const response = await s3Service.s3Client.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefixFilter,
      ContinuationToken: continuationToken,
    }));

    const objects = response.Contents || [];
    allObjects.push(...objects);

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;

  } while (continuationToken);

  return allObjects;
}

async function cleanup(config) {
  const s3Service = new S3Service(config.awsProfile, config.awsRegion, config.localstackEndpoint);
  const logFile = initializeLog(config);

  console.log(``);
  console.log(`CONFIGURAZIONE CLEANUP`);
  console.log(`==================================================================`);
  console.log(`🟢 Avvio cleanup bucket "${config.bucketName}" per oggetti con prefisso "${config.prefixFilter}"`);
  console.log(`⏱️ Età minima per eliminazione: ${config.retentionDays} giorni`);
  console.log(`🌍 AWS Profile: ${config.awsProfile}`);
  console.log(`🌍 AWS Region: ${config.awsRegion}`);
  console.log(`📄 File di log: ${logFile}`);

  if (config.localstackEndpoint) {
    console.log(`🔧 LocalStack Endpoint: ${config.localstackEndpoint}`);
  }

  if (config.dryRun) {
    console.log('⚠️ ATTENZIONE: MODALITÀ SIMULAZIONE (DRY RUN) ATTIVATA. Nessun oggetto verrà eliminato.');
  }

  if (config.limit > -1) {
    console.log(`⚠️ Limite di eliminazione impostato a ${config.limit} oggetti.`);
  } else {
    console.log('⚠️ Nessun limite di eliminazione impostato.');
  }

  const filteredObjects = await listObjectsWithPrefix(s3Service, config.bucketName, config.prefixFilter);
  const totalObjects = filteredObjects.length;
  let deletedObjects = 0;
  const deletedFiles = [];

  console.log(``)
  console.log(``)
  console.log(`📋 Trovati ${totalObjects} oggetti con prefisso "${config.prefixFilter}"`);

  if (totalObjects === 0) {
    console.log('✅ Nessun oggetto da processare.');
    writeLogSummary(logFile, 0, []);
    return;
  }

  progressBar.start(totalObjects, 0);

  let scanCount = 0;
  for (const obj of filteredObjects) {
    if (config.limit >= 0 && scanCount >= config.limit) {
      console.log(`     ⚠️ Limite di eliminazione (${config.limit}) raggiunto.`);
      break;
    }

    const ageDays = getObjectAgeDays(obj.LastModified);
    const shouldDelete = ageDays >= config.retentionDays;

    if (shouldDelete) {
      if (!config.dryRun) {
        await s3Service.s3Client.send(new DeleteObjectCommand({
          Bucket: config.bucketName,
          Key: obj.Key,
        }));
      }
      deletedObjects++;
      deletedFiles.push(obj.Key);
    }

    progressBar.increment();
    scanCount++;

    // delay per evitare throttling
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  progressBar.stop();
  writeLogSummary(logFile, scanCount, deletedFiles);

  console.log(`✅ Cleanup ${config.dryRun ? '(Dry Run) ' : ' '}completato.`);
  console.log(``);
  console.log(``);
  console.log(`RISULTATO ELABORAZIONE`);
  console.log(`==================================================================`);
  console.log(`📌 Oggetti con prefisso "${config.prefixFilter}": ${totalObjects}`);
  console.log(`🗑️ Oggetti eliminati: ${deletedObjects}`);
  console.log(`📁 Oggetti mantenuti: ${totalObjects - deletedObjects}`);
  console.log(`📄 Log salvato in: ${logFile}`);
}

(async () => {
  try {
    const config = parseArguments();

    if (config.help) {
      showHelp();
      process.exit(0);
    }

    if (!validateConfig(config)) {
      process.exit(1);
    }

    await cleanup(config);
  } catch (error) {
    console.error("❌ Errore fatale durante la bonifica:", error);
    process.exit(1);
  }
})();