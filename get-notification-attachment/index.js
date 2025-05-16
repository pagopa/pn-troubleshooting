import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AwsClientsWrapper } from "pn-common";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage() {
  console.log(`
Usage: node index.js --envName <env> --input <iuns.txt> [--restore]

Options:
  --envName, -e   Required. AWS environment (dev|uat|test|prod|hotfix)
  --input, -i     Required. Path to TXT file with IUNs (one per line)
  --restore, -r   Optional. If set, will restore S3 objects and update DynamoDB
  --help, -h      Show this help
`);
}

function parseInputArgs() {
  const args = parseArgs({
    options: {
      envName: { type: 'string', short: 'e' },
      input: { type: 'string', short: 'i' },
      restore: { type: 'boolean', short: 'r' },
      help: { type: 'boolean', short: 'h' }
    },
    strict: true
  });
  if (args.values.help) {
    usage();
    process.exit(0);
  }
  if (!args.values.envName || !args.values.input) {
    usage();
    process.exit(1);
  }
  return args.values;
}

function readIuns(inputPath) {
  const content = readFileSync(inputPath, 'utf-8');
  return content.split('\n').map(l => l.trim()).filter(Boolean);
}

function ensureResultsDir() {
  const resultsDir = path.join(__dirname, 'results');
  if (!existsSync(resultsDir)) mkdirSync(resultsDir);
  return resultsDir;
}

function printProgress(current, total) {
  process.stdout.write(`\rProcessing ${current} of ${total}`);
}

function printSummary(summary, restoreMode) {
  console.log('\n\n=== Summary ===');
  if (!restoreMode) {
    console.log(`Total IUNs processed: ${summary.total}`);
    console.log(`Found notifications: ${summary.foundNotifications}`);
    console.log(`Found documents: ${summary.foundDocuments}`);
    console.log(`CSV output: ${summary.csvFile}`);
  } else {
    console.log(`Total IUNs processed: ${summary.total}`);
    console.log(`Delete markers found and removed: ${summary.deleteMarkersFound}`);
    console.log(`No delete markers: ${summary.noDeleteMarkers}`);
    console.log(`DynamoDB update errors: ${summary.dynamoUpdateErrors}`);
    console.log(`TXT outputs:`);
    console.log(`- With delete markers: ${summary.withDeleteMarkersFile}`);
    console.log(`- Without delete markers: ${summary.withoutDeleteMarkersFile}`);
  }
}

async function getNotificationAttachment(coreClient, iun) {
  try {
    const notifRes = await coreClient._queryRequest('pn-Notifications', 'iun', iun);
    if (!notifRes.Items || notifRes.Items.length === 0) return { found: false };
    const notif = unmarshall(notifRes.Items[0]);
    let documentKey = undefined;
    if (Array.isArray(notif.documents) && notif.documents.length > 0) {
      documentKey = notif.documents[0]?.ref?.key;
    }
    return { found: true, documentKey, notification: notif };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

async function getDocumentStates(confinfoClient, documentKey) {
  try {
    const docRes = await confinfoClient._queryRequest('pn-SsDocumenti', 'documentKey', documentKey);
    if (!docRes.Items || docRes.Items.length === 0) return { found: false };
    const doc = unmarshall(docRes.Items[0]);
    return {
      found: true,
      documentLogicalState: doc.documentLogicalState,
      documentState: doc.documentState
    };
  } catch (e) {
    return { found: false, error: e.message };
  }
}

async function listDeleteMarkers(confinfoClient, bucket, documentKey) {
  try {
    const res = await confinfoClient._listObjectVersions(bucket, documentKey);
    const deleteMarkers = (res.DeleteMarkers || []).filter(dm => dm.Key === documentKey);
    return deleteMarkers;
  } catch (e) {
    return [];
  }
}

async function removeDeleteMarkers(confinfoClient, bucket, documentKey, deleteMarkers) {
  for (const marker of deleteMarkers) {
    try {
      await confinfoClient._deleteObject(bucket, documentKey, marker.VersionId);
    } catch (e) {
    }
  }
}

async function updateDocumentState(confinfoClient, documentKey) {
  try {
    const values = {
      documentState: {
        codeAttr: '#documentState',
        codeValue: ':newdocumentState',
        value: 'attached'
      }
    };
    await confinfoClient._updateItem(
      'pn-SsDocumenti',
      { documentKey },
      values,
      'SET'
    );
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  const args = parseInputArgs();
  const { envName, input, restore } = args;
  const iuns = readIuns(input);
  const total = iuns.length;
  const resultsDir = ensureResultsDir();
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace('.', '-');

  const confinfoClient = new AwsClientsWrapper('confinfo', envName);
  confinfoClient._initDynamoDB();
  confinfoClient._initS3();
  confinfoClient._initSTS();

  const coreClient = new AwsClientsWrapper('core', envName);
  coreClient._initDynamoDB();

  const accountId = (await confinfoClient._getCallerIdentity()).Account;
  const mainBucket = `pn-safestorage-eu-south-1-${accountId}`;

  if (!restore) {
    const csvFile = path.join(resultsDir, `notification_attachments_${timestamp}.csv`);
    writeFileSync(csvFile, 'IUN,Attachment,DocumentLogicalState,DocumentState\n');
    let foundNotifications = 0, foundDocuments = 0;
    let current = 0;
    for (const iun of iuns) {
      current++;
      printProgress(current, total);
      const notifRes = await getNotificationAttachment(coreClient, iun);
      if (!notifRes.found) {
        appendFileSync(csvFile, `${iun},NOT_FOUND,,\n`);
        continue;
      }
      foundNotifications++;
      const documentKey = notifRes.documentKey || '';
      if (!documentKey) {
        appendFileSync(csvFile, `${iun},NO_ATTACHMENT,,\n`);
        continue;
      }
      const docRes = await getDocumentStates(confinfoClient, documentKey);
      if (!docRes.found) {
        appendFileSync(csvFile, `${iun},${documentKey},NOT_FOUND,NOT_FOUND\n`);
        continue;
      }
      foundDocuments++;
      appendFileSync(csvFile, `${iun},${documentKey},${docRes.documentLogicalState},${docRes.documentState}\n`);
    }
    printSummary({
      total,
      foundNotifications,
      foundDocuments,
      csvFile
    }, false);
  } else {
    const withDeleteMarkersFile = path.join(resultsDir, `restored_with_delete_markers_${timestamp}.txt`);
    const withoutDeleteMarkersFile = path.join(resultsDir, `restored_without_delete_markers_${timestamp}.txt`);
    let deleteMarkersFound = 0, noDeleteMarkers = 0, dynamoUpdateErrors = 0;
    let current = 0;
    for (const iun of iuns) {
      current++;
      printProgress(current, total);
      const notifRes = await getNotificationAttachment(coreClient, iun);
      if (!notifRes.found || !notifRes.documentKey) continue;
      const documentKey = notifRes.documentKey;
      const deleteMarkers = await listDeleteMarkers(confinfoClient, mainBucket, documentKey);
      if (deleteMarkers.length > 0) {
        await removeDeleteMarkers(confinfoClient, mainBucket, documentKey, deleteMarkers);
        appendFileSync(withDeleteMarkersFile, `${iun}\n`);
        deleteMarkersFound++;
      } else {
        appendFileSync(withoutDeleteMarkersFile, `${iun}\n`);
        noDeleteMarkers++;
      }
      const updated = await updateDocumentState(confinfoClient, documentKey);
      if (!updated) dynamoUpdateErrors++;
    }
    printSummary({
      total,
      deleteMarkersFound,
      noDeleteMarkers,
      dynamoUpdateErrors,
      withDeleteMarkersFile,
      withoutDeleteMarkersFile
    }, true);
  }
}

main().catch(e => {
  console.error('\nError:', e);
  process.exit(1);
});
