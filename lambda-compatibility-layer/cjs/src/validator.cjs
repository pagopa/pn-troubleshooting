"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getSchema = exports.functionWrapper = void 0;
var _ajv = _interopRequireDefault(require("ajv"));
var _fs = _interopRequireDefault(require("fs"));
var _cli = require("./cli.cjs");
var _utils = require("./utils.cjs");
var _storage = require("./storage.cjs");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const SchemaFileNotFoundError = (0, _utils.createCustomError)("SchemaFileNotFoundError", 404);
const ValidationError = (0, _utils.createCustomError)("ValidationError", 400);

/**
 * Default path to the schema file.
 */
const defaultSchemaPath = "./manifest.json";
let functionSchema = {};

/**
 * Validates the given data against the provided schema.
 * @param {Object} schema - The validation schema.
 * @param {Object} data - The data to validate.
 * @throws {Array<Object>} Throws an array of validation errors if data is
 * invalid.
 */
const validateData = async (schema, data) => {
  const ajv = new _ajv.default({
    useDefaults: true,
    coerceTypes: (0, _utils.isLocalEnvironment)()
  });
  const isDataValid = ajv.validate(schema, data);
  if (!isDataValid) {
    console.error("Data is invalid:", JSON.stringify(ajv.errors));
    throw new ValidationError(JSON.stringify(ajv.errors));
  }
};

/**
 * Pre-handler logic for the function.
 * @param {Object} event - The event object.
 */
const preHandler = async event => {
  if ((0, _utils.isLocalEnvironment)()) {
    const eventFromArgs = (0, _cli.handleLocalCLI)(functionSchema);
    Object.assign(event, eventFromArgs);
  }
  console.log(event);
  if (event.getManifest) {
    return (0, _utils.makeResponse)(200, functionSchema);
  }
  await validateData(functionSchema.input, event);
};

/**
 * Post-handler logic for the function.
 * @param {Object} event - The event object.
 * @param {Object} result - The result object.
 */
const postHandler = async (event, result) => {
  if ((0, _storage.isDirMade)()) {
    if ((0, _utils.isLocalEnvironment)()) {
      result.storagePath = (0, _storage.basePath)();
    } else {
      result.storagePresignedUrl = await (0, _storage.uploadWorkDirToS3)();
    }
  }
};

/**
 * Loads and returns the schema from a given path.
 * @param {string} schemaPath - The path to the schema file.
 * @returns {Object} The schema as an object.
 * @throws {SchemaFileNotFoundError} Throws when the schema file is not found.
 */
const loadSchema = schemaPath => {
  if (!_fs.default.existsSync(schemaPath)) {
    throw new SchemaFileNotFoundError(`Schema manifest not found at ${schemaPath}.`);
  }
  const schemaString = _fs.default.readFileSync(schemaPath, {
    encoding: "utf8"
  });
  return JSON.parse(schemaString);
};

/**
 * Wraps a given handler with pre- and post-processing logic.
 * @param {Function} handler - The original handler function.
 * @param {Object} options - The options object.
 * @param {string} [options.manifestPath=defaultSchemaPath] - The path to the
 * manifest schema file.
 * @returns {Function} The new handler function.
 */
const functionWrapper = (handler, {
  manifestPath = defaultSchemaPath
} = {}) => {
  const newHandler = async (event = {}, context = {}) => {
    try {
      functionSchema = loadSchema(manifestPath);
      const preResult = await preHandler(event);
      if (preResult) return preResult;
    } catch (e) {
      if (e instanceof _cli.HelpArgError) {
        return;
      }
      return (0, _utils.makeErrorResponse)(e);
    }
    const result = await handler(event, context);
    try {
      await postHandler(event, result);
    } catch (e) {
      return (0, _utils.makeErrorResponse)(e);
    }
    return result;
  };
  if ((0, _utils.isLocalEnvironment)()) {
    newHandler().then(result => {
      if (result) {
        console.log("\nResponse:");
        console.log(result);
      }
    });
  }
  return newHandler;
};

/**
 * Gets the current schema.
 * @returns {Object} The function schema.
 */
exports.functionWrapper = functionWrapper;
const getSchema = () => functionSchema;
exports.getSchema = getSchema;