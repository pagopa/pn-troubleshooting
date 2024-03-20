import Ajv from "ajv";
import fs from "fs";
import { handleLocalCLI, HelpArgError } from "./cli.js";
import {
  isLocalEnvironment,
  makeResponse,
  makeErrorResponse,
  createCustomError,
} from "./utils.js";
import { uploadWorkDirToS3, isDirMade, basePath } from "./storage.js";

const SchemaFileNotFoundError = createCustomError(
  "SchemaFileNotFoundError",
  404
);
const ValidationError = createCustomError("ValidationError", 400);

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
  const ajv = new Ajv({
    useDefaults: true,
    coerceTypes: isLocalEnvironment(),
  });

  ajv.addKeyword({
    keyword: "dataClassification",
    type: "string",
    metaSchema: {
      type: "string",
      enum: [
        "PUBLIC",
        "CONFIDENTIAL",
        "HIGHLY_CONFIDENTIAL",
        "RESTRICTED"
      ]
    }
  })

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
const preHandler = async (event) => {
  if (isLocalEnvironment()) {
    const eventFromArgs = handleLocalCLI(functionSchema);
    Object.assign(event, eventFromArgs);
  }
  console.log(event);
  if (event.getManifest) {
    return makeResponse(200, functionSchema);
  }
  await validateData(functionSchema.input, event);
};

/**
 * Post-handler logic for the function.
 * @param {Object} event - The event object.
 * @param {Object} result - The result object.
 */
const postHandler = async (event, result) => {
  if (isDirMade()) {
    if (isLocalEnvironment()) {
      result.storagePath = basePath();
    } else {
      result.storagePresignedUrl = await uploadWorkDirToS3();
    }
  }
};

/**
 * Loads and returns the schema from a given path.
 * @param {string} schemaPath - The path to the schema file.
 * @returns {Object} The schema as an object.
 * @throws {SchemaFileNotFoundError} Throws when the schema file is not found.
 */
const loadSchema = (schemaPath) => {
  if (!fs.existsSync(schemaPath)) {
    throw new SchemaFileNotFoundError(
      `Schema manifest not found at ${schemaPath}.`
    );
  }
  const schemaString = fs.readFileSync(schemaPath, { encoding: "utf8" });
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
export const functionWrapper = (
  handler,
  { manifestPath = defaultSchemaPath } = {}
) => {
  const newHandler = async (event = {}, context = {}) => {
    try {
      functionSchema = loadSchema(manifestPath);
      const preResult = await preHandler(event);
      if (preResult) return preResult;
    } catch (e) {
      if (e instanceof HelpArgError) {
        return;
      }
      return makeErrorResponse(e);
    }

    const result = await handler(event, context);

    try {
      await postHandler(event, result);
    } catch (e) {
      return makeErrorResponse(e);
    }
    return result;
  };

  if (isLocalEnvironment()) {
    newHandler().then((result) => {
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
export const getSchema = () => functionSchema;
