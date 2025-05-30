"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.printStartLog = exports.printEndLog = void 0;
var _jsonschema = require("jsonschema");
var _config = require("./config.cjs");
var _pino = _interopRequireDefault(require("pino"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const auditType = 'AUD_DIAG';
const v = new _jsonschema.Validator();

/**
 * Creates an audit logger using pino logger.
 * @param {string} aud_type - Audit type.
 * @returns {pino} A pino logger instance with the audit log entry.
 */
const getAuditLogger = audType => {
  return (0, _pino.default)({
    level: 'info',
    timestamp: _pino.default.stdTimeFunctions.isoTime,
    messageKey: 'message',
    formatters: {
      level(label) {
        return {
          level: label.toUpperCase()
        };
      },
      log(obj) {
        obj.name = 'AUDIT_LOG';
        obj.logger_name = 'diagnostic-compatibility-logger';
        obj.tags = ['AUDIT10Y'];
        obj.aud_type = audType;
        obj.message = `[${audType}] ${obj.message}`;
        return obj;
      }
    }
  });
};
const logger = getAuditLogger(auditType);

/**
 * Prints an audit log entry.
 * @param {Object} record - The initial log record data.
 * @param {string} message - Message to include in the log.
 * @param {string} subAudType - Sub audit type.
 * @param {string} status - Operation status, either 'OK' or 'KO'.
 */
const auditLog = (record, message = '', subAudType, status = 'OK') => {
  let level_value = status === 'OK' ? 20000 : 40000;
  let label = status === 'OK' ? 'INFO' : 'ERROR';
  message = `${subAudType} - ${label} - ${message}`;
  const outObj = {
    ...record,
    message,
    level_value
  };
  if (status === 'OK') {
    logger.info(outObj);
  } else {
    logger.error(outObj);
  }
};

/**
 * Filters data based on a schema, retaining properties marked with `audit`.
 * @param {Object} schema - JSON schema for validating and filtering the data.
 * @param {Object} data - The data object to filter.
 */
const filterData = (schema, data) => {
  const unmarshall = (instance, schema) => {
    if (schema[_config.auditSchemaKey]) {
      return instance;
    }
    return undefined;
  };
  const res = v.validate(data, schema, {
    rewrite: unmarshall
  });
};

/**
 * Logs the start of a Lambda function with filtered event.
 * @param {Object} objectIn - The event object of the Lambda.
 * @param {Object} schema - JSON schema to filter the input object.
 * @param {string} requestID - AWS requestID.
 * @param {string} functionArn - ARN of the Lambda function.
 */
const printStartLog = (objectIn, schema, requestID, functionArn) => {
  let event = JSON.parse(JSON.stringify(objectIn));
  filterData(schema, event);
  const record = {
    requestID,
    functionArn,
    event
  };
  auditLog(record, 'Lambda started', 'BEFORE');
};

/**
 * Logs the end of a Lambda function with filtered result.
 * @param {Object} objectOut - The result object of the Lambda.
 * @param {Object} schema - JSON schema to filter the output object.
 * @param {string} requestID - AWS requestID.
 * @param {string} functionArn - ARN of the Lambda function.
 */
exports.printStartLog = printStartLog;
const printEndLog = (objectOut, schema, requestID, functionArn) => {
  let result = JSON.parse(JSON.stringify(objectOut));
  filterData(schema, result);
  const record = {
    requestID,
    functionArn,
    result
  };
  auditLog(record, 'Lambda ended', 'AFTER');
};
exports.printEndLog = printEndLog;