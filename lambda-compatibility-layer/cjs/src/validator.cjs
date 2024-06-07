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
var _path = _interopRequireDefault(require("path"));
var _url = require("url");
var _log = require("./log.cjs");
var _config = require("./config.cjs");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const SchemaFileNotFoundError = (0, _utils.createCustomError)('SchemaFileNotFoundError', 404);
const ValidationError = (0, _utils.createCustomError)('ValidationError', 400);

// import * as metaSchema from './metaSchema.json' with { type: 'json' };
// -> Done in this way to avoid node warnings
const metaSchema = JSON.parse(_fs.default.readFileSync(_path.default.join(_path.default.dirname((0, _url.fileURLToPath)(import.meta.url)), '../data/metaSchema.json'), {
  encoding: 'utf8'
}));

/**
 * Default path to the schema file.
 */
const defaultSchemaPath = './manifest.json';
const functionSchema = {};
const dataAjv = new _ajv.default({
  useDefaults: true,
  coerceTypes: (0, _utils.isLocalEnvironment)()
});
dataAjv.addKeyword({
  keyword: _config.dataClassificationSchemaKey,
  metaSchema: {
    type: 'string',
    enum: ['PUBLIC', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'RESTRICTED']
  }
});
dataAjv.addKeyword({
  keyword: _config.auditSchemaKey,
  metaSchema: {
    type: 'boolean'
  }
});

/**
 * Validates the given data against the provided schema.
 * @param {Object} schema - The validation schema.
 * @param {Object} data - The data to validate.
 * @throws {Array<Object>} Throws an array of validation errors if data is
 * invalid.
 */
const validateData = (schema, data) => {
  const isDataValid = dataAjv.validate(schema, data);
  if (!isDataValid) {
    console.error('Data is invalid:', JSON.stringify(dataAjv.errors[0], null, 2));
    throw new ValidationError(JSON.stringify(dataAjv.errors));
  }
};

/**
 * Validates the given manifest against the metaSchema.
 * @param {Object} manifest - The manifest to validate.
 * @throws {Object} Throws a validation error object if data is invalid.
 */
const validateManifest = manifest => {
  const ajv = new _ajv.default();
  const isDataValid = ajv.validate(metaSchema, manifest);
  if (!isDataValid) {
    console.error('Manifest is invalid:', JSON.stringify(ajv.errors[0], null, 2));
    throw new ValidationError(JSON.stringify(ajv.errors));
  }
};

/**
 * Pre-handler logic for the function.
 * @param {Object} event - The event object.
 * @param {Object} context - The context object.
 */
const preHandler = (event, context) => {
  if ((0, _utils.isLocalEnvironment)()) {
    const eventFromArgs = (0, _cli.handleLocalCLI)(functionSchema, metaSchema);
    Object.assign(event, eventFromArgs);
  }
  if (event.getManifest) {
    return (0, _utils.makeResponse)(200, functionSchema);
  }
  validateData(functionSchema.input, event);
  if (!(0, _utils.isLocalEnvironment)()) {
    (0, _log.printStartLog)(event, functionSchema.input, context.awsRequestId, context.invokedFunctionArn);
  }
};

/**
 * Post-handler logic for the function.
 * @param {Object} event - The event object.
 * @param {Object} context - The context object.
 * @param {Object} result - The result object.
 */
const postHandler = async (event, context, result) => {
  if ((0, _storage.isDirMade)()) {
    if ((0, _utils.isLocalEnvironment)()) {
      result.storagePath = (0, _storage.basePath)();
    } else {
      result.storagePresignedUrl = await (0, _storage.uploadWorkDirToS3)();
    }
  }
  validateData(functionSchema.output, result);
  if (!(0, _utils.isLocalEnvironment)()) {
    (0, _log.printEndLog)(result, functionSchema.output, context.awsRequestId, context.invokedFunctionArn);
  }
};

/**
 * Loads and returns the schema from a given path.
 * @param {string} schemaPath - The path to the schema file.
 * @throws {SchemaFileNotFoundError} Throws when the schema file is not found.
 */
const loadSchema = schemaPath => {
  if (!_fs.default.existsSync(schemaPath)) {
    throw new SchemaFileNotFoundError(`Schema manifest not found at ${schemaPath}.`);
  }
  const schemaString = _fs.default.readFileSync(schemaPath, {
    encoding: 'utf8'
  });
  const schema = JSON.parse(schemaString);
  validateManifest(schema);
  Object.assign(functionSchema, schema);
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
      loadSchema(manifestPath);
      const preResult = preHandler(event, context);
      if (preResult) return preResult;
    } catch (e) {
      if (e instanceof _cli.HelpArgError || e instanceof ValidationError) {
        return;
      }
      return (0, _utils.makeErrorResponse)(e);
    }
    const result = await handler(event, context);
    try {
      await postHandler(event, context, result);
    } catch (e) {
      return (0, _utils.makeErrorResponse)(e);
    }
    return result;
  };
  if ((0, _utils.isLocalEnvironment)()) {
    newHandler().then(result => {
      if (result) {
        console.log('\nResponse:');
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