"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.processArgvToObject = exports.printUsage = exports.handleLocalCLI = exports.HelpArgError = void 0;
var _utils = require("./utils.cjs");
var _path = _interopRequireDefault(require("path"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const HelpArgError = exports.HelpArgError = (0, _utils.createCustomError)('HelpArgError');
const maxDescriptionLen = 50;
const descriptionCol = 50;

/**
 * Formats a command's description with indentation and proper column alignment.
 *
 * @param {string} indent - The indentation to apply to the command.
 * @param {string} command - The command or option to describe.
 * @param {string} description - The description of the command.
 * @param {number} [col=descriptionCol] - The column at which to align the
 * description text.
 * @param {number} [maxLen=maxDescriptionLen] - The maximum length of the
 * description before wrapping.
 * @returns {string} The formatted command description.
 */
const indentDescription = (indent, command, description, col = descriptionCol, maxLen = maxDescriptionLen) => {
  let out = indent + command;
  out += ' '.repeat(col - out.length);
  let currentLen = 0;
  for (const word of description.split(' ')) {
    currentLen += word.length;
    if (currentLen >= maxLen) {
      out += '\n' + indent + ' '.repeat(col - indent.length);
      currentLen = 0;
    }
    out += word + ' ';
  }
  out += '\n';
  return out;
};

/**
 * Generates a usage string for CLI options based on the provided schema.
 *
 * @param {Object} schema - The schema describing the CLI options.
 * @param {string} [indent=''] - The indentation to use for the options.
 * @param {string} [prefix=''] - The prefix to use for nested options.
 * @param {boolean} [required=false] - Indicates if the option is required.
 * @returns {string} A formatted string of CLI options.
 */
const generateUsage = (schema, indent = '', prefix = '', required = false) => {
  let options = '';
  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      const optionPrefix = prefix ? `${prefix}.${key}` : `--${key}`;
      let required = schema.required && schema.required.includes(key);
      options += generateUsage(value, indent, optionPrefix, required);
    }
  }
  if (schema.oneOf) {
    schema.oneOf.forEach((value, i) => {
      options += generateUsage(value, `${indent}  `, prefix);
      if (i < schema.oneOf.length - 1) options += `${indent}xor\n`;
    });
  }
  if (schema.type !== 'object' && schema.type) {
    let optionLine = '';
    if (schema.description) {
      optionLine += `${schema.description} `;
    }
    if (required) {
      optionLine += `(required) `;
    }
    if (schema.default) {
      optionLine += `(default: ${schema.default}) `;
    }
    if (schema.maximum) {
      optionLine += `(maximum: ${schema.maximum}) `;
    }
    if (schema.minimum) {
      optionLine += `(minimum: ${schema.minimum}) `;
    }
    options += indentDescription(indent, `${prefix} ${schema.type}`, optionLine);
    if (schema.enum) {
      optionLine = `Allowed values: [${schema.enum.join(', ')}]`;
      options += indentDescription(indent, '', optionLine);
    }
  }
  return options;
};

/**
 * Applies underline formatting to text for CLI output.
 * 
 * @param {string} text - The text to underline.
 * @returns {string} The underlined text.
 */
const underline = text => `\x1b[4m${text}\x1b[0m`;

/**
 * Prints the usage information for the CLI based on the provided manifest.
 *
 * @param {Object} schema - The function manifest.
 * @param {string} [scriptName='<script>'] - The name of the script.
 */
const printUsage = (schema, scriptName = '<script>') => {
  console.log(`\n${underline(schema.name ? schema.name : scriptName)}\n`);
  if (schema.description) {
    console.log(indentDescription('', '', schema.description, 2));
  }
  console.log(`${underline('Synopsys:')}\n`);
  console.log(`  $ node ${scriptName} [OPTIONS]\n`);
  console.log(`  $ node ${scriptName} --help\n`);
  console.log(`  $ node ${scriptName} --getManifest\n`);
  console.log(`${underline('Options:')}\n`);
  console.log(generateUsage(schema.input, '  '));
};

/**
 * Converts command line arguments to an object.
 *
 * @param {Array<string>} argv - The command line arguments.
 * @returns {Object} The arguments converted to an object.
 */
exports.printUsage = printUsage;
const processArgvToObject = argv => {
  const assignValueByPath = (obj, pathArray, value) => {
    const key = pathArray.shift();
    if (pathArray.length > 0) {
      if (!obj[key]) {
        obj[key] = {};
      }
      assignValueByPath(obj[key], pathArray, value);
    } else {
      obj[key] = value;
    }
  };
  const result = {};
  argv.slice(2).forEach((arg, index, self) => {
    if (arg.startsWith('--')) {
      const path = arg.substring(2);
      let value = self[index + 1];
      if (!value || value && value.startsWith('--')) {
        value = "true";
      }
      if (value && !value.startsWith('--')) {
        assignValueByPath(result, path.split('.'), value);
      }
    }
  });
  return result;
};

/**
 * Handles local CLI invocation, parsing arguments and optionally printing help.
 *
 * @param {Object} schema - The function manifest.
 * @returns {Object} The parsed command line arguments as an object.
 * @throws {HelpArgError} When --help is present in the arguments.
 */
exports.processArgvToObject = processArgvToObject;
const handleLocalCLI = schema => {
  if (process.argv.includes('--help')) {
    const scriptName = _path.default.basename(process.argv[1]);
    printUsage(schema, scriptName);
    throw new HelpArgError('--help in args!');
  }
  return processArgvToObject(process.argv, schema.input);
};
exports.handleLocalCLI = handleLocalCLI;