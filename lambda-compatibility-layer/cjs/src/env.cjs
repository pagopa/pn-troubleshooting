"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getS3Bucket = exports.getPresignedUrlSeconds = exports.getLambdaFunctionName = exports.getCurrentRegion = exports.getAssumeRoleConfinfoArn = void 0;
/**
 * Retrieves the value of an environment variable.
 *
 * @param {string} env - The name of the environment variable to retrieve.
 * @return {string} The value of the specified environment variable or undefined.
 */
const getEnvironmentVariable = env => process.env[env];

/**
 * Retrieves the name of the AWS Lambda function from environment variables.
 *
 * @return {string} The name of the AWS Lambda function, or undefined if not
 * set.
 */
const getLambdaFunctionName = () => getEnvironmentVariable("AWS_LAMBDA_FUNCTION_NAME");

/**
 * Retrieves the current region from environment variables.
 *
 * @return {string} The current region, or undefined if not set.
 */
exports.getLambdaFunctionName = getLambdaFunctionName;
const getCurrentRegion = () => getEnvironmentVariable("AWS_REGION");

/**
 * Retrieves the ARN for an assumed role from environment variables.
 *
 * @return {string} The ARN for the assume role configuration, or undefined if
 * not set.
 */
exports.getCurrentRegion = getCurrentRegion;
const getAssumeRoleConfinfoArn = () => getEnvironmentVariable("COMPAT_CONFINFO_ASSUME_ROLE_ARN");

/**
 * Retrieves the S3 bucket name from environment variables.
 *
 * @return {string} The S3 bucket name, or undefined if not set.
 */
exports.getAssumeRoleConfinfoArn = getAssumeRoleConfinfoArn;
const getS3Bucket = () => getEnvironmentVariable("COMAPT_S3_BUCKET");

/**
 * Retrieves the duration (in seconds) that a presigned URL for S3 objects
 * should remain valid.
 *
 * @return {number} The duration in seconds, or undefined if not set.
 */
exports.getS3Bucket = getS3Bucket;
const getPresignedUrlSeconds = () => {
  let sec = getEnvironmentVariable("COMAPT_PRESIGNED_URL_SECONDS");
  if (sec) {
    return parseInt(getEnvironmentVariable("COMAPT_PRESIGNED_URL_SECONDS"));
  } else {
    return undefined;
  }
};
exports.getPresignedUrlSeconds = getPresignedUrlSeconds;