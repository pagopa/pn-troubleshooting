import { createCustomError } from './utils.js';
import path from 'path';
import fs from 'fs';

export const HelpArgError = createCustomError('HelpArgError');
export const PayloadTypeError = createCustomError('PayloadTypeError');

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
const indentDescription = (
  indent,
  command,
  description,
  col = descriptionCol,
  maxLen = maxDescriptionLen
) => {
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
    if (schema.default !== undefined) {
      optionLine += `(default: ${schema.default}) `;
    }
    if (schema.maximum !== undefined) {
      optionLine += `(maximum: ${schema.maximum}) `;
    }
    if (schema.minimum !== undefined) {
      optionLine += `(minimum: ${schema.minimum}) `;
    }
    options += indentDescription(
      indent,
      `${prefix} ${schema.type}`,
      optionLine
    );
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
const underline = (text) => `\x1b[4m${text}\x1b[0m`;

/**
 * Prints the usage information for the CLI based on the provided manifest.
 *
 * @param {Object} schema - The function manifest.
 * @param {string} [scriptName='<script>'] - The name of the script.
 */
export const printUsage = (
  schema,
  scriptName = '<script>',
  metaSchemaVersion
) => {
  console.log(`\n${underline(schema.name ? schema.name : scriptName)}\n`);
  if (schema.description) {
    console.log(indentDescription('', '', schema.description, 2));
  }
  if (metaSchemaVersion) {
    console.log(
      indentDescription('', '', `MetaSchema ${metaSchemaVersion}`, 2)
    );
  }
  console.log(`${underline('Synopsys:')}\n`);
  console.log(`  $ node ${scriptName} [OPTIONS]\n`);
  console.log(`  $ node ${scriptName} --help\n`);
  console.log(`  $ node ${scriptName} --getManifest\n`);
  console.log(`  $ node ${scriptName} --inputPayload [JSON input string]\n`);
  console.log(`  $ node ${scriptName} --inputPayloadFile [JSON input file]\n`);
  console.log(`${underline('Options:')}\n`);
  console.log(generateUsage(schema.input, '  '));
};

/**
 * Converts command line arguments to an object.
 *
 * @param {Array<string>} argv - The command line arguments.
 * @returns {Object} The arguments converted to an object.
 */
export const processArgvToObject = (argv) => {
  // Helper function to assign a value to a nested object based on a path array
  const assignValueByPath = (obj, pathArray, value) => {
    const key = pathArray.shift();
    if (pathArray.length > 0) {
      obj[key] = obj[key] || {};
      assignValueByPath(obj[key], pathArray, value);
    } else {
      obj[key] = value;
    }
  };

  const result = {};

  argv.slice(2).forEach((arg, index, self) => {
    if (arg.startsWith('--')) {
      let path = arg.substring(2);
      let value = self[index + 1];
      let returnValue;

      // Array definition
      if (arg.endsWith(':')) {
        path = path.slice(0, -1);
        returnValue = [];
      }
      // Boolean definition if value not found
      else if (!value || (value && value.startsWith('--'))) {
        returnValue = 'true';
      }

      // Value definition
      if (value && !value.startsWith('--')) {
        returnValue = arg.endsWith(':') ? [value] : value;
        // Add consecutive non-flag values to the array
        for (
          let i = 2;
          self[index + i] && !self[index + i].startsWith('--');
          i++
        ) {
          returnValue.push(self[index + i]);
        }
      }
      assignValueByPath(result, path.split('.'), returnValue);
    }
  });

  return result;
};

/**
 * Handles local CLI invocation, parsing arguments and optionally printing help.
 *
 * @param {Object} schema - The function manifest.
 * @param {Object} metaSchema - The meta schema of manifest.
 * @returns {Object} The parsed command line arguments as an object.
 * @throws {HelpArgError} When --help is present in the arguments.
 */
export const handleLocalCLI = (schema, metaSchema) => {
  const inputObject = processArgvToObject(process.argv, schema.input);
  if ('help' in inputObject) {
    const scriptName = path.basename(process.argv[1]);
    printUsage(schema, scriptName, metaSchema['$comment']);
    throw new HelpArgError('--help in args!');
  }
  if ('inputPayloadFile' in inputObject) {
    inputObject.inputPayload = fs.readFileSync(
      inputObject.inputPayloadFile,
      'utf8'
    );
  }
  if ('inputPayload' in inputObject) {
    const jsonInput = JSON.parse(inputObject.inputPayload);
    if (typeof jsonInput !== 'object') {
      throw new PayloadTypeError('Payload input string must be of type object');
    }
    return jsonInput;
  }
  return inputObject;
};
