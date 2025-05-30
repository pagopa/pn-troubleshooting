//-------------------------------------------------

const { AwsClientsWrapper } = require('pn-common');
const { dirname } = require('path');
const { inspect, parseArgs } = require('util');
const { fs, readFileSync, mkdirSync, existsSync, appendFileSync } = require('fs');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node index.js --envName|-e <environment> --inputFile|-f <path>

Description:
    Given a list of fileKeys the script generates a json array where each element has a predefined structure.

Parameters:
    --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
    --inputFile, -f   Required. Path to the file containing the FileKeys
    --help, -h        Display this help message

Example:
    node index.js --envName dev --inputFile ./input.json`;

    const args = parseArgs({
        options: {
            envName: { type: 'string', short: 'e' },
            inputFile: { type: 'string', short: 'f' },
            help: { type: 'boolean', short: 'h' }
        },
        strict: true
    });
    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }
    if (!args.values.envName || !args.values.inputFile) {
        console.error('Error: Missing required parameters');
        console.log(usage);
        process.exit(1);
    }
    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }
    return args;
};

/**
 * Creating the output
 * @param {array} data - JSON data to write
 */
function writeInFile(data) {
    // Create directory if it doesn't exist
    const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const path = ('./result/output_' + dateIsoString + '.json');
    const dir = dirname(path);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Writing error messages to file
    appendFileSync(path, JSON.stringify(data, null, 2));
};

async function main() {
    // Parse and validate arguments
    const args = validateArgs();
    const { envName, inputFile } = args.values;
    const data = readFileSync(inputFile, 'utf8');
    const fileRows = data.split('\n');

    // Initialize AWS client
    const clientDB = new AwsClientsWrapper("confinfo", envName);
    clientDB._initDynamoDB();

    // Creation of the output
    let final = [];
    for (row of fileRows) {
        let result = await clientDB._queryRequest('pn-SsDocumenti', 'documentKey', row);
        let info = unmarshall(result.Items[0]);
        let temp = {
            key: info.documentKey, // from table pn-SsDocumenti
            versionId: "01",
            documentType: info.documentType.tipoDocumento, // from table pn-SsDocumenti
            documentStatus: info.documentLogicalState, // from table pn-SsDocumenti
            contentType: info.contentType, // from table pn-SsDocumenti
            checksum: info.checkSum, // from table pn-SsDocumenti
            retentionUntil: info.retentionUntil, // from table pn-SsDocumenti 
            client_short_code: info.clientShortCode // from table pn-SsDocumenti
        };
        final.push(temp);
    };
    writeInFile(final);
};

main();