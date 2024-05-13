"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.uploadWorkDirToS3 = exports.pathJoin = exports.isDirMade = exports.basePath = exports.S3BucketNotDefinedError = void 0;
var _utils = require("./utils.cjs");
var _awsAuth = require("./awsAuth.cjs");
var _uuid = require("uuid");
var _clientS = require("@aws-sdk/client-s3");
var _s3RequestPresigner = require("@aws-sdk/s3-request-presigner");
var _env = require("./env.cjs");
var _path = _interopRequireDefault(require("path"));
var _fs = _interopRequireDefault(require("fs"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const S3BucketNotDefinedError = exports.S3BucketNotDefinedError = (0, _utils.createCustomError)('S3BucketNotDefinedError', 500);
const executionTime = (0, _utils.formatToUTC)(Date.now());
const uuid = (0, _uuid.v4)();
const localBaseDir = './out';
const lambdaBaseDir = '/tmp';
const localBasePath = _path.default.join(localBaseDir, executionTime);
const lambdaBasePath = _path.default.join(lambdaBaseDir, executionTime);

/**
 * Generates a unique S3 object key based on function name, execution time, and
 * UUID.
 * @returns {string} The generated S3 object key.
 */
const s3objectKey = () => `${(0, _utils.getFunctionName)()}_${executionTime}_${uuid}.zip`;
const bucketName = (0, _env.getS3Bucket)();
const presignedUrlExpiresInSeconds = (0, _env.getPresignedUrlSeconds)() ?? 86400; // 24 hr
let dirMade = false;

/**
 * Returns the base path where the compatibility library expects the computation
 * output files to be located. This function is useful for determining the root
 * path to save output files before they are automatically zipped and uploaded
 * to S3 by AWS Lambda.
 *
 * @return {string} The base path for output files.
 */
const basePath = () => {
  const path = (0, _utils.isLocalEnvironment)() ? localBasePath : lambdaBasePath;
  if (!dirMade && !_fs.default.existsSync(path)) {
    dirMade = true;
    _fs.default.mkdirSync(path, {
      recursive: true
    });
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
exports.basePath = basePath;
const pathJoin = (...paths) => {
  return _path.default.join(basePath(), ...paths);
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
exports.pathJoin = pathJoin;
const uploadToS3 = async (key, filePath) => {
  if (!bucketName) {
    throw new S3BucketNotDefinedError('S3 bucket name not defined in env vars.');
  }
  const client = new _clientS.S3Client((0, _awsAuth.awsClientConfig)('core'));
  const fileStream = _fs.default.createReadStream(filePath);
  const uploadParams = {
    Bucket: bucketName,
    Key: key,
    Body: fileStream
  };
  const data = await client.send(new _clientS.PutObjectCommand(uploadParams));
  // Creating a presigned URL for downloading the file
  const url = await (0, _s3RequestPresigner.getSignedUrl)(client, new _clientS.GetObjectCommand({
    Bucket: bucketName,
    Key: key
  }), {
    expiresIn: presignedUrlExpiresInSeconds
  });
  return url;
};

/**
 * Zips the working directory and uploads it to S3, then deletes the local zip
 * file.
 * @returns {Promise<string|undefined>} A promise that resolves with the
 * presigned URL of the uploaded directory, or undefined if the directory
 * doesn't exist.
 */
const uploadWorkDirToS3 = async () => {
  if (!dirMade || !_fs.default.existsSync(basePath())) {
    return;
  }
  const key = s3objectKey();
  const baseDir = (0, _utils.isLocalEnvironment)() ? localBaseDir : lambdaBaseDir;
  let outPath = _path.default.join(baseDir, key);
  try {
    await (0, _utils.createZip)(basePath(), outPath);
    const presignedUrl = await uploadToS3(key, outPath);
    _fs.default.rmSync(outPath);
    return presignedUrl;
  } catch (e) {
    console.error(e);
  }
};
exports.uploadWorkDirToS3 = uploadWorkDirToS3;
const isDirMade = () => dirMade;
exports.isDirMade = isDirMade;