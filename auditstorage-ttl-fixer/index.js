import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { Temporal } from '@js-temporal/polyfill';  //npm install @js-temporal/polyfill
//const DynamoDBService = require("./service/DynamoDBService");
import {DynamoDBService} from "./service/DynamoDBService.js";
const cliProgress = require('cli-progress');
const fs = require('fs');
const path = require('path');

// Dichiarazione di una lista di tipi di record che devono essere lavorati sulla tabella AuditStorage di DynamoDB
/*const retention = [
  { id: "LOG_SAVER_EXECUTION", offset: Temporal.Duration.ofDays(365 * 10 + 3 + 1) }, //Temporal.Duration.from({ days: 3654 });
  { id: "AUDIT10Y", offset: Temporal.Duration.ofDays(365 * 10 + 3 + 1) },
  { id: "AUDIT5Y", offset: Temporal.Duration.ofDays(365 * 5 + 2 + 1) },
  { id: "AUDIT2Y", offset: Temporal.Duration.ofDays(365 * 2 + 1 + 1) },
  { id: "DEVELOPER", offset: Temporal.Duration.ofDays(120 + 1)) }
];*/
const retentionTypes = [
  { id: "LOG_SAVER_EXECUTION", offset: Temporal.Duration.from({ days: 3654, hours: 1}) },
  { id: "AUDIT10Y$ZIP", offset: Temporal.Duration.from({ days: 3654, hours: 1}) }, { id: "AUDIT10Y$PDF_SIGNED", offset: Temporal.Duration.from({ days: 3654, hours: 1}) },
  { id: "AUDIT5Y$ZIP", offset: Temporal.Duration.from({days: 1828, hours: 1}) }, { id: "AUDIT5Y$PDF_SIGNED", offset: Temporal.Duration.from({days: 1828, hours: 1}) },
  { id: "AUDIT2Y$ZIP", offset: Temporal.Duration.from({days: 732, hours: 1}) }, { id: "AUDIT2Y$PDF_SIGNED", offset: Temporal.Duration.from({days: 732, hours: 1}) },
  { id: "DEVELOPER$ZIP", offset: Temporal.Duration.from({days: 121, hours: 1}) }, { id: "DEVELOPER$PDF_SIGNED", offset: Temporal.Duration.from({days: 121, hours: 1}) }
];

const retentionMap = new Map(retentionTypes.map(r => [r.id, r.offset]));

// Parsing degli argomenti da linea di comando
function parseArguments() {
  const args = process.argv.slice(2);
  const config = {
    awsProfile: null,
    awsRegion: null,
    dynamoTable: "pn-AuditStorage",
    limit: -1, //Limite di aggiornamento records, -1 tutti i records
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
📚 AUDITSTORAGE TTL EXPIRATION FIX - Guida all'uso
==================================================================

Uso: node index.js [OPZIONI]

OPZIONI OBBLIGATORIE:
  --aws-profile <profilo>     Profilo AWS da utilizzare
  --aws-region <regione>      Regione AWS (es: eu-south-1)

OPZIONI FACOLTATIVE:
  --limit <numero>            Limite oggetti da aggiornare (default: -1, nessun limite)
  --localstack-endpoint <url> Endpoint LocalStack per test locali
  --log-file <percorso>       File di log per tracciare gli aggiornamenti (default: bonificaTTL-log-TIMESTAMP.txt)
  --dry-run                   Modalità simulazione (nessun aggiornamento)
  --help                      Mostra questa guida

ESEMPI:

# Esecuzione base (produzione)
node index.js --aws-profile mio-profilo --aws-region eu-south-1

# Con retention personalizzata e limite
node index.js --aws-profile mio-profilo --aws-region eu-south-1 --limit 10

# Modalità dry-run per test
node index.js --aws-profile mio-profilo --aws-region eu-south-1 --dry-run

# Test con LocalStack
node index.js --aws-profile localstack --aws-region eu-south-1 --localstack-endpoint http://localhost:4566

# Prefisso personalizzato con log
node index.js --aws-profile mio-profilo --aws-region eu-south-1 --log-file ./my-bonificaTtl.log
`);
}

function validateConfig(config) {
  const required = ['awsProfile', 'awsRegion'];
  const missing = required.filter(field => !config[field]);
  
  if (missing.length > 0) {
    console.error(`❌ Parametri obbligatori mancanti: ${missing.map(f => '--' + f.replace(/([A-Z])/g, '-$1').toLowerCase()).join(', ')}`);
    console.error('Usa --help per la guida completa.');
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
  const defaultLogFile = `auditstorage-ttl-expiration-fix-log-${timestamp}.txt`;
  const logFile = config.logFile || defaultLogFile;
  
  // Crea la cartella logs se non esiste
  const logDir = path.dirname(logFile);
  if (logDir !== '.' && !fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Scrive l'intestazione del log
  const header = `AUDITSTORAGE TTL EXPIRATION FIX - ESECUZIONE
========================================================
Timestamp: ${new Date().toISOString()}
AWS Profile: ${config.awsProfile}
AWS Region: ${config.awsRegion}
Dynamo Table: ${config.dynamoTable}
Limite: ${config.limit === -1 ? 'Nessuno' : config.limit}
Modalità: ${config.dryRun ? 'DRY RUN' : 'REALE'}
${config.localstackEndpoint ? `LocalStack: ${config.localstackEndpoint}` : ''}
========================================================

`;

  fs.writeFileSync(logFile, header);
  return logFile;
}

function writeLogSummary(logFile, totalScanned, updateRecords) {
  const summary = `
RIEPILOGO:
Totale record scansionati: ${totalScanned}
Totale record aggiornati: ${updateRecords}
`;

  fs.appendFileSync(logFile, summary);
}

//inizializza il file per la scrittura di un obj
function createBackupScanAuditStorage() {
  // Genera nome file di backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFile = `backup/backup-scan-auditstorage-${timestamp}.json`;
  console.log(`📄 File di backup: ${backupFile}`);

  // Crea la cartella logs se non esiste
  const backupDir = path.dirname(backupFile);
  if (backupDir !== '.' && !fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Scrive inizializza il file
  const header = " ";

  fs.writeFileSync(backupFile, header);
  return backupFile;
}
//scrive su file un obj
function writeBackupFile(backupFile, obj) {
  const backupJson = JSON.stringify(obj);
  fs.appendFileSync(backupFile, backupJson);
}

const progressBar = new cliProgress.SingleBar({
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
  noTTYOutput: true,
});

//calcolo l'offset a seconda del type dell'auditStorage ed aggiorna l'expiration in tabella
function processToUpdateRecord(dynamoService, config, item ) {
    // Chiave primaria dell'elemento da aggiornare (sia Partition Key che Sort Key)
    const ITEM_KEY = {
      type: item.type,           // Valore della Partition Key
      logDate: item.logDate,      // Valore della Sort Key
    };
    console.log(``);

    const logDateInit = Temporal.PlainDateTime.from(item.logDate.toString()+"T00:00:00");
    if(config.limit > -1 ){
        console.log("Record da processare partition-key: ", item.type, " - logDate impostazione iniziale: ", logDateInit.toString());
    }
    let offsetGiorni = Temporal.Duration.from({ seconds: 0 });
    //console.log(`Record da processare type: ${item.type} - logDate: ${item.logDate}`);
    if (item.type == "LOG_SAVER_EXECUTION") {  //devo calcolare l'audit maggiore

        let maxDuration = Temporal.Duration.from({ seconds: 0 }); // Inizializza a zero
        Object.entries(item.retentionResult).forEach(([retentionId, auditResultObj]) => {
          if (auditResultObj.result === 'SENT') {
              // Trova l'offset corrispondente usando l'ID e la retentionMap
              const duration = retentionMap.get(retentionId);
              //console.log("Record da processare retentionId: ", retentionId, " - duration: ", duration.toString());
              if (duration !== undefined && Temporal.Duration.compare(duration, maxDuration) > 0) {
                maxDuration = duration;
              }
          }
        });
        offsetGiorni = maxDuration;
    }else{
        //console.log("Record da processare type AUDIT: ", item.type);
        if(item.result === 'SENT'){
            offsetGiorni = retentionMap.get(item.type);
        }
    }

    const expPlainDateTime = logDateInit.add(offsetGiorni);
    const expStr = expPlainDateTime.toString();
    const expStrDate = new Date(expStr);
    //console.log("expStrDate: ", expStrDate , " - expStrDate ISO: ", expStrDate.toISOString());
    const expStrTime = expStrDate.getTime();
    const expStrDataInSecond = Math.floor(expStrTime/1000);
    if(config.limit > -1){
        console.log("###### offsetGiorni: " , offsetGiorni.toString(), " - logDate + offset: ", expStrDate.toISOString(), " - in secondi: " , expStrDataInSecond);
    }
    //console.log("###### exp: " , expStr ," - expStrDate: ", expStrDate, " - expStrTime: ", expStrTime, " - expStrDataInSecond: ", expStrDataInSecond);
    console.log("");

    if (!config.dryRun) {
        try{
            const result = dynamoService.updateItem(config.dynamoTable, ITEM_KEY, expStrDataInSecond);
            return result;
        }catch (err) {
            console.error("Errore durante l'aggiornamento:", JSON.stringify(err, null, 2));
            return null;
        }
    }else{
        return null;
   }

}

async function bonificaTTL(config) {

  const logFile = initializeLog(config);

  console.log(``);
  //console.log(`Starting process at ${new Date(Date.now()).toISOString()}`);
  console.log(`CONFIGURAZIONE BONIFICA TTL sulla tabella Dynamo "pn-AuditStorage" `);
  console.log(`==================================================================`);
  console.log(`🟢 Avvio BONIFICA TTL per settare la property 'expiration' sui records della tabella "pn-AuditStorage" `);
  console.log(`🌍 AWS Profile: ${config.awsProfile}`);
  console.log(`🌍 AWS Region: ${config.awsRegion}`);
  console.log(`📄 File di log: ${logFile}`);

  if (config.localstackEndpoint) {
    console.log(`🔧 LocalStack Endpoint: ${config.localstackEndpoint}`);
  }

  if (config.dryRun) {
    console.log('⚠️ ATTENZIONE: MODALITÀ SIMULAZIONE (DRY RUN) ATTIVATA. Nessun oggetto verrà aggiornato.');
  }

  if (config.limit > -1) {
    console.log(`⚠️ Limite di aggiornamento impostato a ${config.limit} records.`);
  } else {
    console.log('⚠️ Nessun limite di aggiornamento impostato.');
  }

  // Definizione dei service per operazioni sui servizi AWS.
  let dynamoService = null;
  if (config.localstackEndpoint) {
    dynamoService = new DynamoDBService(config.awsProfile, config.awsRegion, config.localstackEndpoint); //config.awsProfile, config.awsRegion);
  }else{
    dynamoService = new DynamoDBService(config.awsProfile, config.awsRegion, undefined);
  }

  //const backupFile = createBackupScanAuditStorage();
  const filteredObjects = await dynamoService.scanItemsWithMissingExpiration(config.dynamoTable);
  //writeBackupFile(backupFile, filteredObjects);

  const totalObjects = filteredObjects.length;
  console.log(``)
  console.log(``)
  console.log(`📋 Trovati ${totalObjects} records`);

  if (totalObjects === 0) {
    console.log('✅ Nessun record da processare.');
    writeLogSummary(logFile, 0, []);
    return;
  }

  progressBar.start(totalObjects, 0);

  let updateObjects = 0;
  let scanCount = 0;
  for (const obj of filteredObjects) {
    if (config.limit >= 0 && scanCount >= config.limit) {
      console.log(`     ⚠️ Limite di aggiornamento (${config.limit}) raggiunto.`);
      break;
    }

    if (await processToUpdateRecord(dynamoService, config, obj)) {
      updateObjects++;
    }
    progressBar.increment();
    scanCount++;

    // delay per evitare throttling
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  progressBar.stop();
  writeLogSummary(logFile, scanCount, updateObjects);

  console.log(`✅ BonificaTTL ${config.dryRun ? '(Dry Run) ' : ' '} completato.`);
  console.log(``);
  console.log(``);
  console.log(`RISULTATO ELABORAZIONE`);
  console.log(`==================================================================`);
  console.log(`📌 Records della tabella Dynamo "${config.dynamoTable}": ${totalObjects}`);
  console.log(`🗑️ Records aggiornati: ${updateObjects}`);
  console.log(`📄 Log salvato in: ${logFile}`);


}

//////////////////////////////////////

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

    await bonificaTTL(config);
  } catch (error) {
    console.error("❌ Errore fatale durante l'esecuzione dello script: ", error);
    process.exit(1);
  }
})();