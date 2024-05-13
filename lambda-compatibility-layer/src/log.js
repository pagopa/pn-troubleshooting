import { Validator } from 'jsonschema';
import bunyan from 'bunyan';

const auditTypeStart = 'AUD_DIAG_START';
const auditTypeEnd = 'AUD_DIAG_END';

const v = new Validator();

/**
 * Creates an audit log entry using Bunyan logger.
 * @param {Object} record - The initial log record data.
 * @param {string} message - Message to include in the log.
 * @param {string} aud_type - Audit type.
 * @param {string} status - Operation status, either 'OK' or 'KO'.
 * @returns {bunyan} A bunyan logger instance with the audit log entry.
 */
const auditLog = (record, message = '', aud_type, status) => {
  let statusMessage = `INFO - ${message}`;
  if (status === 'OK') {
    statusMessage = `OK - SUCCESS - ${message}`;
  }
  if (status === 'KO') {
    statusMessage = `KO - FAILURE - ${message}`;
  }

  const auditRecord = Object.assign(record, {
    name: 'AUDIT_LOG',
    message: `[${aud_type}] - ${statusMessage}`,
    aud_type: aud_type,
    level: status === 'KO' ? 'ERROR' : 'INFO',
    level_value: status === 'KO' ? 40000 : 20000,
    logger_name: 'diagnostic-compatibility-logger',
    tags: ['AUDIT10Y'],
  });

  return bunyan.createLogger(auditRecord);
};

/**
 * Filters data based on a schema, retaining properties marked with `audit`.
 * @param {Object} schema - JSON schema for validating and filtering the data.
 * @param {Object} data - The data object to filter.
 */
const filterData = (schema, data) => {
  const unmarshall = (instance, schema) => {
    if (schema.audit) {
      return instance;
    }
    return undefined;
  };
  const res = v.validate(data, schema, { rewrite: unmarshall });
};

/**
 * Logs the start of a Lambda function with filtered event.
 * @param {Object} objectIn - The event object of the Lambda.
 * @param {Object} schema - JSON schema to filter the input object.
 * @param {string} requestID - AWS requestID.
 * @param {string} functionArn - ARN of the Lambda function.
 */
export const printStartLog = (objectIn, schema, requestID, functionArn) => {
  let event = JSON.parse(JSON.stringify(objectIn));
  filterData(schema, event);
  const record = {
    requestID,
    functionArn,
    event,
  };
  auditLog(record, 'Lambda started', auditTypeStart, 'OK').info('info');
};

/**
 * Logs the end of a Lambda function with filtered result.
 * @param {Object} objectOut - The result object of the Lambda.
 * @param {Object} schema - JSON schema to filter the output object.
 * @param {string} requestID - AWS requestID.
 * @param {string} functionArn - ARN of the Lambda function.
 */
export const printEndLog = (objectOut, schema, requestID, functionArn) => {
  let result = JSON.parse(JSON.stringify(objectOut));
  filterData(schema, result);
  const record = {
    requestID,
    functionArn,
    result,
  };
  auditLog(record, 'Lambda ended', auditTypeEnd, 'OK').info('info');
};
