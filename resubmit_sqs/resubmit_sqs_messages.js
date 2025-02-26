//-------------------------------------------------

const { AwsClientsWrapper } = require('pn-common');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { dirname } = require('path');
const { parseArgs } = require('util');

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];
const VALID_ACCOUNT = ['core', 'confinfo'];

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node resubmit_sqs_messages.js --accountType|-a <AWSAccount> --envName|-e <environment> --queueUrl|-q <queueUrl> --inputFile|-f <path>

Description:
    The script allows you to submit events to SQS from an input file

Parameters:
    --accountType, -a Required. Account were is located the SQS (core|confinfo)
    --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
    --queueUrl, -q    Required. SQS where put the messages
    --inputFile, -f   Required. Path and name of the input file with the messages to put in SQS
    --help, -h        Display this help message

Example:
    node resubmit_sqs_messages.js --accountType core --envName hotfix --queueUrl https://sqs.eu-south-1.amazonaws.com/207905393513/pn-national_registry_gateway_inputs-DLQ --inputFile ./input.json`;

    const args = parseArgs({
        options: {
            accountType: { type: 'string', short: 'a' },
            envName: { type: 'string', short: 'e' },
            queueUrl: { type: 'string', short: 'q' },
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
    if (!VALID_ACCOUNT.includes(args.values.accountType)) {
        console.error(`Error: Invalid AWS Account. Must be one of: ${VALID_ACCOUNT.join(', ')}`);
        process.exit(1);
    }
    return args;
};

/**
 * Process input file
 * @param {string} inputFile - Path to input file
 * @returns {Array} Array of messages to republish
 */
function formatFile(inputFile) {
    const data = readFileSync(inputFile, { encoding: 'utf8', flag: 'r' });
    const msgsToRepublish = JSON.parse(data);
    let msgsList = [];
    for (i = 0, j = 1; i < msgsToRepublish.length; i++, j++) {
        let json = msgsToRepublish[i]
        msgsList.push(
            {
                Id: 'msg' + j,
                MessageBody: json.Body,
                MessageAttributes: json.MessageAttributes
            }
        );
    }
    return (msgsList);
};

/**
 * Creating an output file on error
 * @param {string} outputFile - Target file path
 * @param {array} data - JSON data to write (message not write)
 */
function writeInFile(outputFile, data) {
    // Create directory if it doesn't exist
    const dir = dirname(outputFile);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Writing error messages to file
    writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf-8');
}

async function main() {
    // Parse and validate arguments
    const args = validateArgs();
    const { accountType, envName, queueUrl, inputFile } = args.values;

    // Initialize AWS client
    const clientDB = new AwsClientsWrapper(accountType, envName);
    clientDB._initSQS();

    // Process input file
    const inputMsgs = formatFile(inputFile);
    const result = await clientDB._sendSQSMessageBatch(queueUrl, inputMsgs);
    if (result.Failed) {
        const queueName = queueUrl.match(/pn-[\w-]+/);
        writeInFile('results/msg_not_resubmitted_' + queueName[0] + '.json', result.Failed);
        console.log('\nFailed resubmission of ' + result.Failed.length + ' messages\n');
    }
    else {
        console.log('\nNo messages Failed. All ' + result.Successful.length + ' messages submitted\n');
    }
};

main();