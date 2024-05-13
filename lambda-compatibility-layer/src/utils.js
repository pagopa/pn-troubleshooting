import archiver from 'archiver';
import fs from 'fs';
import { getSchema } from './validator.js';
import { getLambdaFunctionName } from './env.js';

/**
 * Determines if the current environment is local or not.
 * @returns {boolean} True if the environment is local, false otherwise.
 */
export const isLocalEnvironment = () => {
  return !getLambdaFunctionName();
};

/**
 * Creates a ZIP archive of a directory.
 *
 * @param {string} directoryPath - The path to the directory to be archived.
 * @param {string} outputPath - The path where the ZIP file should be saved.
 * @returns {Promise<string>} A promise that resolves with the outputPath upon
 * successful archive creation.
 */
export const createZip = async (directoryPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    output.on('close', () => resolve(outputPath));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(directoryPath, false);
    archive.finalize();
  });
};

/**
 * Creates a response object suitable for returning from a web service endpoint.
 *
 * @param {number} statusCode - The HTTP status code for the response.
 * @param {Object} body - The content of the response body. If provided, this
 * will be JSON stringified.
 * @returns {Object} An object representing the HTTP response, with a
 * 'statusCode' and a 'body' property.
 */
export const makeResponse = (statusCode, body) => {
  return {
    statusCode,
    body: JSON.stringify(body),
  };
};

/**
 * Creates an error response object suitable for returning from a web service
 * endpoint.
 *
 * @param {Error} error - The error containing 'statusCode' property.
 * @returns {Object} An object representing the HTTP response, with a
 * 'statusCode' and a 'errorMessage' property.
 */
export const makeErrorResponse = (error) => {
  return {
    statusCode: error.statusCode | 500,
    errorMessage: error.toString(),
  };
};

/**
 * Creates a custom error type with a specified name.
 *
 * @param {string} name - The name of the custom error.
 * @param {number} statusCode - The status code of the HTTP result.
 * @returns {Error} A new custom Error class.
 */
export const createCustomError = (name, statusCode) => {
  return class extends Error {
    constructor(message) {
      super(message);
      this.name = name;
      this.statusCode = statusCode;
      if (typeof Error.captureStackTrace === 'function') {
        Error.captureStackTrace(this, this.constructor);
      } else {
        this.stack = new Error(message).stack;
      }
    }
  };
};

/**
 * Retrieves the name of the Lambda function, falling back to the schema name if
 * not running in a Lambda environment.
 * @returns {string} The name of the Lambda function or the name specified in
 * the schema.
 */
export const getFunctionName = () => {
  const function_name = getLambdaFunctionName();
  return !function_name ? getSchema().name : function_name;
};

/**
 * Formats a timestamp into an UTC ISO string (without : - .).
 * @param {number} timestamp - The timestamp to format, UNIX epoch.
 * @returns {string} A string representing the formatted UTC date and time.
 */
export const formatToUTC = (timestamp) => {
  const date = new Date(timestamp);
  const pad = (num) => num.toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};
