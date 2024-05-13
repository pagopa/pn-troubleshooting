/**
 * Retrieves the value of an environment variable.
 *
 * @param {string} env - The name of the environment variable to retrieve.
 * @return {string|undefined} The value of the specified environment variable or undefined.
 */
const getEnvironmentVariable = (env) => process.env[env];

/**
 * Retrieves the name of the AWS Lambda function from environment variables.
 *
 * @return {string|undefined} The name of the AWS Lambda function, or undefined if not
 * set.
 */
export const getLambdaFunctionName = () =>
  getEnvironmentVariable('AWS_LAMBDA_FUNCTION_NAME');

/**
 * Retrieves the current region from environment variables.
 *
 * @return {string|undefined} The current region, or undefined if not set.
 */
export const getCurrentRegion = () => getEnvironmentVariable('AWS_REGION');

/**
 * Retrieves the ARN for an assumed role from environment variables.
 *
 * @return {string|undefined} The ARN for the assume role configuration, or undefined if
 * not set.
 */
export const getAssumeRoleConfinfoArn = () =>
  getEnvironmentVariable('COMPAT_CONFINFO_ASSUME_ROLE_ARN');

/**
 * Retrieves the S3 bucket name from environment variables.
 *
 * @return {string|undefined} The S3 bucket name, or undefined if not set.
 */
export const getS3Bucket = () => getEnvironmentVariable('COMAPT_S3_BUCKET');

/**
 * Retrieves the duration (in seconds) that a presigned URL for S3 objects
 * should remain valid.
 *
 * @return {number|undefined} The duration in seconds, or undefined if not set.
 */
export const getPresignedUrlSeconds = () => {
  const value = parseInt(
    getEnvironmentVariable('COMAPT_PRESIGNED_URL_SECONDS')
  );
  if (isNaN(value)) {
    return undefined;
  }
  return value;
};
