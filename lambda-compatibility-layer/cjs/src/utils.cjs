"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.makeResponse = exports.makeErrorResponse = exports.isLocalEnvironment = exports.getFunctionName = exports.createZip = exports.createCustomError = void 0;
var _archiver = _interopRequireDefault(require("archiver"));
var _fs = _interopRequireDefault(require("fs"));
var _validator = require("./validator.cjs");
var _env = require("./env.cjs");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
/**
 * Determines if the current environment is local or not.
 * @returns {boolean} True if the environment is local, false otherwise.
 */
const isLocalEnvironment = () => {
  return !(0, _env.getLambdaFunctionName)();
};

/**
 * Creates a ZIP archive of a directory.
 *
 * @param {string} directoryPath - The path to the directory to be archived.
 * @param {string} outputPath - The path where the ZIP file should be saved.
 * @returns {Promise<string>} A promise that resolves with the outputPath upon
 * successful archive creation.
 */
exports.isLocalEnvironment = isLocalEnvironment;
const createZip = async (directoryPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const output = _fs.default.createWriteStream(outputPath);
    const archive = (0, _archiver.default)("zip", {
      zlib: {
        level: 9
      }
    });
    output.on("close", () => resolve(outputPath));
    archive.on("error", err => reject(err));
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
exports.createZip = createZip;
const makeResponse = (statusCode, body) => {
  return {
    statusCode,
    body: JSON.stringify(body)
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
exports.makeResponse = makeResponse;
const makeErrorResponse = error => {
  return {
    statusCode: error.statusCode | 500,
    errorMessage: error.toString()
  };
};

/**
 * Creates a custom error type with a specified name.
 *
 * @param {string} name - The name of the custom error.
 * @param {number} statusCode - The status code of the HTTP result.
 * @returns {Error} A new custom Error class.
 */
exports.makeErrorResponse = makeErrorResponse;
const createCustomError = (name, statusCode) => {
  return class extends Error {
    constructor(message) {
      super(message);
      this.name = name;
      this.statusCode = statusCode;
      if (typeof Error.captureStackTrace === "function") {
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
 * @returns {string} The name of the Lambda function or the name specified in the schema.
 */
exports.createCustomError = createCustomError;
const getFunctionName = () => {
  const function_name = (0, _env.getLambdaFunctionName)();
  return !function_name ? (0, _validator.getSchema)().name : function_name;
};
exports.getFunctionName = getFunctionName;