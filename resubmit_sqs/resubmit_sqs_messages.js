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
 * @returns {Array} Array of parsed entries
 */
function formatFile(inputFile) {
    let fileRows = readFileSync(inputFile, 'utf8');
    const regexFirst = /^\[/;
    const regexLast = /\]$/;
    // Check first and last character
    if (regexFirst.test(fileRows.charAt(0)) && regexLast.test(fileRows.charAt(fileRows.length - 1))) {
        const jsonArray = JSON.parse(fileRows);
        return (jsonArray);
    } else {
        // Add commas between JSON objects and enclose everything in square brackets
        const jsonInLine = '[' + fileRows.replace(/}\n{"Body"/g, '},\n{"Body"') + ']';
        // Convert the JSON string to an array of JSON objects
        const jsonArray = JSON.parse(jsonInLine);
        return (jsonArray);
    }
};

/**
 * Process input file
 * @param {string} msgsToRepublish - Json list of msgs
 * @returns {Array} Array of blocks of 10 msgs
 */
function formatInput(msgsToRepublish) {
    let allBlocksOfMsgs = [];
    let indx = 1;
    while (msgsToRepublish.length > 0) {
        let singleBlockOfMsgs = [];
        msgsToRepublish.slice(0, 10).forEach(json => {
            singleBlockOfMsgs.push(
                {
                    Id: 'msg' + indx,
                    MessageBody: json.Body,
                    MessageAttributes: json.MessageAttributes
                }
            )
            indx++;
        });
        allBlocksOfMsgs.push(singleBlockOfMsgs);
        msgsToRepublish.splice(0, 10);
    };
    return (allBlocksOfMsgs);
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
};

async function main() {
    // Parse and validate arguments
    const args = validateArgs();
    const { accountType, envName, queueUrl, inputFile } = args.values;
    // Initialize AWS client
    const clientDB = new AwsClientsWrapper(accountType, envName);
    clientDB._initSQS();
    // Process input file
    const msgsList = formatFile(inputFile);
    const totMsgs = msgsList.length;
    // Group msgs into blocks of 10 elements and store these blocks in an overall object
    const allBlocksOfMsgs = formatInput(msgsList);
    let run = 0;
    let msgsResubmit = 0;
    let result = [];
    for (block of allBlocksOfMsgs) {
        try {
            result = await clientDB._sendSQSMessageBatch(queueUrl, allBlocksOfMsgs[run]);
            if (result.Failed) {
                const queueName = queueUrl.match(/pn-[\w-]+/);
                try {
                    writeInFile('results/msg_not_resubmitted_' + queueName[0] + '.json', result.Failed);
                    console.log('\nFailed resubmission of ' + result.Failed.length + ' messages\n');
                } catch (err) {
                    console.log('\n');
                    console.error('\nError creating JSON file:', err);
                }
            }
            else {
                console.log('\nAll ' + allBlocksOfMsgs[run].length + ' msgs of block ' + run + ' have been successfully resubmit');
                msgsResubmit = msgsResubmit + allBlocksOfMsgs[run].length;
            }
        }
        catch (err) {
            console.log('\n');
            console.error('\nError while deleting ' + allBlocksOfMsgs[run].length + ' msgs in the block ' + run, JSON.stringify(err, null, 2));
        }
        run++
    };
    console.log('\n');
    console.log('Number of runs performed --> ' + allBlocksOfMsgs.length + ' of ' + run);
    console.log('\n');
    console.log('Number of msgs resubmit --> ' + msgsResubmit + ' of ' + totMsgs);
    console.log('\n');
};

main();