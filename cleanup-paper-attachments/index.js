const dotenv = require('dotenv');
const S3Service = require('./service/S3Service');
const cliProgress = require('cli-progress');
const { ListObjectsV2Command, GetObjectTaggingCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

dotenv.config();

const BUCKET_NAME = process.env.BUCKET_NAME;
const RETENTION_DAYS = process.env.RETENTION_DAYS !== undefined
    ? parseInt(process.env.RETENTION_DAYS)
    : 120;

const TAG_KEY = 'storage_freeze';
const TAG_VALUE = 'PN_PAPER_ATTACHMENT';
const endpoint = process.env.LOCALSTACK_ENDPOINT || null;

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

async function hasTargetTag(key) {
  try {
    const tagging = await s3Service.s3Client.send(new GetObjectTaggingCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    return tagging.TagSet.some(tag => tag.Key === TAG_KEY && tag.Value === TAG_VALUE);
  } catch (e) {
    console.error(`Errore tag per ${key}:`, e);
    return false;
  }
}

async function listAllObjects() {
  let continuationToken = undefined;
  const allObjects = [];

  do {
    const response = await s3Service.s3Client.send(new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      ContinuationToken: continuationToken,
    }));

    const objects = response.Contents || [];
    allObjects.push(...objects);

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;

  } while (continuationToken);

  return allObjects;
}

async function cleanup() {
  console.log(`🟢 Avvio cleanup bucket "${BUCKET_NAME}"`);

  const allObjects = await listAllObjects();
  const totalObjects = allObjects.length;

  let deletedObjects = 0;

  progressBar.start(totalObjects, 0);

  for (const obj of allObjects) {
    const ageDays = getObjectAgeDays(obj.LastModified);
    const shouldDelete = (await hasTargetTag(obj.Key)) && (ageDays > RETENTION_DAYS);

    if (shouldDelete) {
      await s3Service.s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: obj.Key,
      }));
      deletedObjects++;
    }

    progressBar.increment();

    // Simula un ritardo
    // await new Promise(resolve => setTimeout(resolve, 1000));
  }

  progressBar.stop();

  console.log(`✅ Cleanup completato.`);
  console.log(`📌 Oggetti totali scansionati: ${totalObjects}`);
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
