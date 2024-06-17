import Ajv from 'ajv';
import fs from 'fs';
import { handleLocalCLI, HelpArgError } from './cli.js';
import {
  isLocalEnvironment,
  makeResponse,
  makeErrorResponse,
  createCustomError,
} from './utils.js';
import { uploadWorkDirToS3, isDirMade, basePath } from './storage.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { printStartLog, printEndLog } from './log.js';
import { auditSchemaKey, dataClassificationSchemaKey } from './config.js'

const SchemaFileNotFoundError = createCustomError(
  'SchemaFileNotFoundError',
  404
);
const ValidationError = createCustomError('ValidationError', 400);

// import * as metaSchema from './metaSchema.json' with { type: 'json' };
// -> Done in this way to avoid node warnings
const metaSchema = JSON.parse(
  fs.readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../data/metaSchema.json'
    ),
    { encoding: 'utf8' }
  )
);

/**
 * Default path to the schema file.
 */
const defaultSchemaPath = './manifest.json';

const functionSchema = {};

const dataAjv = new Ajv({
  useDefaults: true,
  coerceTypes: isLocalEnvironment(),
});

dataAjv.addKeyword({
  keyword: dataClassificationSchemaKey,
  metaSchema: {
    type: 'string',
    enum: ['PUBLIC', 'CONFIDENTIAL', 'HIGHLY_CONFIDENTIAL', 'RESTRICTED'],
  },
});

dataAjv.addKeyword({
  keyword: auditSchemaKey,
  metaSchema: {
    type: 'boolean',
  },
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
    console.error(
      'Data is invalid:',
      JSON.stringify(dataAjv.errors[0], null, 2)
    );
    throw new ValidationError(JSON.stringify(dataAjv.errors));
  }
};

/**
 * Validates the given manifest against the metaSchema.
 * @param {Object} manifest - The manifest to validate.
 * @throws {Object} Throws a validation error object if data is invalid.
 */
const validateManifest = (manifest) => {
  const ajv = new Ajv();

  const isDataValid = ajv.validate(metaSchema, manifest);
  if (!isDataValid) {
    console.error(
      'Manifest is invalid:',
      JSON.stringify(ajv.errors[0], null, 2)
    );
    throw new ValidationError(JSON.stringify(ajv.errors));
  }
};

/**
 * Pre-handler logic for the function.
 * @param {Object} event - The event object.
 * @param {Object} context - The context object.
 */
const preHandler = (event, context) => {
  if (isLocalEnvironment()) {
    const eventFromArgs = handleLocalCLI(functionSchema, metaSchema);
    Object.assign(event, eventFromArgs);
  }
  if (event.getManifest) {
    return makeResponse(200, functionSchema);
  }
  validateData(functionSchema.input, event);
  if (!isLocalEnvironment()) {
    printStartLog(
      event,
      functionSchema.input,
      context.awsRequestId,
      context.invokedFunctionArn
    );
  }
};

/**
 * Post-handler logic for the function.
 * @param {Object} event - The event object.
 * @param {Object} context - The context object.
 * @param {Object} result - The result object.
 */
const postHandler = async (event, context, result) => {
  if (isDirMade()) {
    if (isLocalEnvironment()) {
      result.storagePath = basePath();
    } else {
      result.storagePresignedUrl = await uploadWorkDirToS3();
    }
  }
  validateData(functionSchema.output, result);
  if (!isLocalEnvironment()) {
    printEndLog(
      result,
      functionSchema.output,
      context.awsRequestId,
      context.invokedFunctionArn
    );
  }
};

/**
 * Loads and returns the schema from a given path.
 * @param {string} schemaPath - The path to the schema file.
 * @throws {SchemaFileNotFoundError} Throws when the schema file is not found.
 */
const loadSchema = (schemaPath) => {
  if (!fs.existsSync(schemaPath)) {
    throw new SchemaFileNotFoundError(
      `Schema manifest not found at ${schemaPath}.`
    );
  }
  const schemaString = fs.readFileSync(schemaPath, { encoding: 'utf8' });
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
export const functionWrapper = (
  handler,
  { manifestPath = defaultSchemaPath } = {}
) => {
  const newHandler = async (event = {}, context = {}) => {
    try {
      loadSchema(manifestPath);
      const preResult = preHandler(event, context);
      if (preResult) return preResult;
    } catch (e) {
      if (e instanceof HelpArgError || e instanceof ValidationError) {
        return;
      }
      return makeErrorResponse(e);
    }

    const result = await handler(event, context);

    try {
      await postHandler(event, context, result);
    } catch (e) {
      return makeErrorResponse(e);
    }
    return result;
  };

  if (isLocalEnvironment()) {
    newHandler().then((result) => {
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
export const getSchema = () => functionSchema;
