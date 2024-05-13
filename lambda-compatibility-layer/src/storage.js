import {
  isLocalEnvironment,
  createZip,
  getFunctionName,
  createCustomError,
  formatToUTC,
} from './utils.js';
import { awsClientConfig } from './awsAuth.js';
import { v4 as uuidv4 } from 'uuid';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Bucket, getPresignedUrlSeconds } from './env.js';
import path from 'path';
import fs from 'fs';

export const S3BucketNotDefinedError = createCustomError(
  'S3BucketNotDefinedError',
  500
);

const executionTime = formatToUTC(Date.now());
const uuid = uuidv4();

const localBaseDir = './out';
const lambdaBaseDir = '/tmp';

const localBasePath = path.join(localBaseDir, executionTime);
const lambdaBasePath = path.join(lambdaBaseDir, executionTime);

/**
 * Generates a unique S3 object key based on function name, execution time, and
 * UUID.
 * @returns {string} The generated S3 object key.
 */
const s3objectKey = () => `${getFunctionName()}_${executionTime}_${uuid}.zip`;
const bucketName = getS3Bucket();

const presignedUrlExpiresInSeconds = getPresignedUrlSeconds() ?? 86400; // 24 hr
let dirMade = false;

/**
 * Returns the base path where the compatibility library expects the computation
 * output files to be located. This function is useful for determining the root
 * path to save output files before they are automatically zipped and uploaded
 * to S3 by AWS Lambda.
 *
 * @return {string} The base path for output files.
 */
export const basePath = () => {
  const path = isLocalEnvironment() ? localBasePath : lambdaBasePath;
  if (!dirMade && !fs.existsSync(path)) {
    dirMade = true;
    fs.mkdirSync(path, { recursive: true });
  }
  return path;
};

/**
 * Constructs a file path by joining various path segments. This function is
 * crucial for creating file paths within the base directory, ensuring files are
 * properly organized and easily accessible.
 *
 * @param {...string} paths The path segments to join.
 * @return {string} The resulting complete file path.
 */
export const pathJoin = (...paths) => {
  return path.join(basePath(), ...paths);
};

/**
 * Uploads a file to S3 and returns a presigned URL for downloading it.
 * @param {string} key - The key under which to store the file in S3.
 * @param {string} filePath - The local path of the file to upload.
 * @returns {Promise<string>} A promise that resolves with the presigned URL of
 * the uploaded file.
 * @throws {S3BucketNotDefinedError} If the S3 bucket name is not defined in
 * environment variables.
 */
const uploadToS3 = async (key, filePath) => {
  if (!bucketName) {
    throw new S3BucketNotDefinedError(
      'S3 bucket name not defined in env vars.'
    );
  }

  const client = new S3Client(awsClientConfig('core'));
  const fileStream = fs.createReadStream(filePath);

  const uploadParams = {
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
  };

  const data = await client.send(new PutObjectCommand(uploadParams));
  // Creating a presigned URL for downloading the file
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

/**
 * Zips the working directory and uploads it to S3, then deletes the local zip
 * file.
 * @returns {Promise<string|undefined>} A promise that resolves with the
 * presigned URL of the uploaded directory, or undefined if the directory
 * doesn't exist.
 */
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
