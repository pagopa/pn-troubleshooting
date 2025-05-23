const dotenv = require('dotenv');
const S3Service = require('./service/S3Service');
const cliProgress = require('cli-progress');
const { ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');

dotenv.config();

const BUCKET_NAME = process.env.BUCKET_NAME;
const RETENTION_DAYS = process.env.RETENTION_DAYS !== undefined
    ? parseInt(process.env.RETENTION_DAYS)
    : 120;

const PREFIX_FILTER = 'ogg';
const LIMIT = 3;
const endpoint = process.env.LOCALSTACK_ENDPOINT || null;

const DRY_RUN = process.argv.includes('--dry-run');

const s3Service = new S3Service(process.env.AWS_PROFILE, process.env.AWS_REGION, endpoint);

const progressBar = new cliProgress.SingleBar({
  barCompleteChar: '\u2588',
  barIncompleteChar: '\u2591',
  hideCursor: true,
});

function getObjectAgeDays(lastModified) {
  const today = new Date();
  return Math.floor((today - new Date(lastModified)) / (1000 * 60 * 60 * 24));
}

async function listObjectsWithPrefix() {
  let continuationToken = undefined;
  const allObjects = [];

  do {
    const response = await s3Service.s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: PREFIX_FILTER,
      ContinuationToken: continuationToken,
    }));

    const objects = response.Contents || [];
    allObjects.push(...objects);

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;

  } while (continuationToken);

  return allObjects;
}

async function cleanup() {
  console.log(``);
  console.log(`CONFIGURAZIONE CLEANUP`);
  console.log(`==================================================================`);
  console.log(`🟢 Avvio cleanup bucket "${BUCKET_NAME}" per oggetti con prefisso "${PREFIX_FILTER}"`);
  console.log(`⏱️ Età minima per eliminazione: ${RETENTION_DAYS} giorni`);

  if (DRY_RUN) {
    console.log('⚠️ ATTENZIONE: MODALITÀ SIMULAZIONE (DRY RUN) ATTIVATA. Nessun oggetto verrà eliminato.');
  }

  if (LIMIT != null && LIMIT > -1) {
    console.log(`⚠️ Limite di eliminazione impostato a ${LIMIT} oggetti.`);
  } else {
    console.log('⚠️ Nessun limite di eliminazione impostato.');
  }

  const filteredObjects = await listObjectsWithPrefix();
  const totalObjects = filteredObjects.length;
  let deletedObjects = 0;

  console.log(``)
  console.log(``)
  console.log(`📋 Trovati ${totalObjects} oggetti con prefisso "${PREFIX_FILTER}"`);

  if (totalObjects === 0) {
    console.log('✅ Nessun oggetto da processare.');
    return;
  }

  progressBar.start(totalObjects, 0);

  let scanCount = 0;
  for (const obj of filteredObjects) {
    if (LIMIT != null && LIMIT >= 0 && scanCount >= LIMIT) {
      console.log(`     ⚠️ Limite di eliminazione (${LIMIT}) raggiunto.`);
      break;
    }

    const ageDays = getObjectAgeDays(obj.LastModified);
    const shouldDelete = ageDays > RETENTION_DAYS;

    if (shouldDelete) {
      if (!DRY_RUN) {
        await s3Service.s3Client.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
        }));
      }
      deletedObjects++;
    }

    progressBar.increment();
    scanCount++;

    // delay
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  progressBar.stop();

  console.log(`✅ Cleanup ${DRY_RUN ? '(Dry Run) ' : ' '}completato.`);
  console.log(``);
  console.log(``);
  console.log(`RISULTATO ELABORAZIONE`);
  console.log(`==================================================================`);
  console.log(`📌 Oggetti con prefisso "${PREFIX_FILTER}": ${totalObjects}`);
  console.log(`🗑️ Oggetti eliminati: ${deletedObjects}`);
  console.log(`📁 Oggetti mantenuti: ${totalObjects - deletedObjects}`);
}

(async () => {
  try {
    await cleanup();
  } catch (error) {
    console.error("❌ Errore fatale durante la bonifica:", error);
  }
})();