import {
  isLocalEnvironment,
  createZip,
  getFunctionName,
  createCustomError,
} from "./utils.js";
import { awsClientConfig } from "./awsAuth.js";
import { v4 as uuidv4 } from "uuid";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Bucket, getPresignedUrlSeconds } from "./env.js";
import path from "path";
import fs from "fs";

export const S3BucketNotDefinedError = createCustomError(
  "S3BucketNotDefinedError",
  500
);

const executionTime = formatToUTC(Date.now());
const uuid = uuidv4();

const localBaseDir = "./out";
const lambdaBaseDir = "/tmp";

const localBasePath = path.join(localBaseDir, executionTime);
const lambdaBasePath = path.join(lambdaBaseDir, executionTime);

const s3objectKey = () => `${getFunctionName()}_${executionTime}_${uuid}.zip`;
const bucketName = getS3Bucket();

const presignedUrlExpiresInSeconds = getPresignedUrlSeconds() ?? 86400; // 24 hr
let dirMade = false;

/**
 * Formats a timestamp into an UTC ISO string (without : - .).
 * @param {number} timestamp - The timestamp to format, UNIX epoch.
 * @returns {string} A string representing the formatted UTC date and time.
 */
const formatToUTC = (timestamp) => {
  const date = new Date(timestamp);
  // Padding per garantire che i componenti della data siano sempre in formato a due cifre
  const pad = (num) => num.toString().padStart(2, "0");
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

export const basePath = () => {
  const path = isLocalEnvironment() ? localBasePath : lambdaBasePath;
  if (!dirMade && !fs.existsSync(path)) {
    dirMade = true;
    fs.mkdirSync(path, { recursive: true });
  }
  return path;
};

export const pathJoin = (...paths) => {
  return path.join(basePath(), ...paths);
};

const uploadToS3 = async (key, filePath) => {
  if (!bucketName) {
    throw new S3BucketNotDefinedError(
      "S3 bucket name not defined in env vars."
    );
  }

  const client = new S3Client(awsClientConfig("core"));
  const fileStream = fs.createReadStream(filePath);

  const uploadParams = {
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
  };

  const data = await client.send(new PutObjectCommand(uploadParams));
  // Creazione dell'URL presigned per il download del file
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
    { expiresIn: presignedUrlExpiresInSeconds }
  );
  return url;
};

export const uploadWorkDirToS3 = async () => {
  if (!dirMade || !fs.existsSync(basePath())) {
    return;
  }
  const key = s3objectKey();
  const baseDir = isLocalEnvironment() ? localBaseDir : lambdaBaseDir;
  let outPath = path.join(baseDir, key);
  try {
    await createZip(basePath(), outPath);
    const presignedUrl = await uploadToS3(key, outPath);
    fs.rmSync(outPath);
    return presignedUrl;
  } catch (e) {
    console.error(e);
  }
};

export const isDirMade = () => dirMade;
