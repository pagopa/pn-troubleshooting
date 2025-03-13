//-------------------------------------------------

const { AwsClientsWrapper } = require('pn-common');
const { readFileSync, mkdirSync, existsSync, appendFileSync } = require('fs');
const { dirname } = require('path');
const { parseArgs } = require('util');
const { randomUUID } = require('crypto');

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];
const VALID_ACCOUNT = ['core', 'confinfo'];

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node index.js --accountType|-a <AWSAccount> --envName|-e <environment> --queueName|-q <queueName> --inputFile|-f <path>

Description:
    The script allows you to submit events to SQS from an input file

Parameters:
    --accountType, -a Required. Account were is located the SQS (core|confinfo)
    --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
    --queueName, -q    Required. SQS where put the messages
    --inputFile, -f   Required. Path and name of the input file with the messages to put in SQS
    --help, -h        Display this help message

Example:
    node index.js --accountType core --envName hotfix --queueName pn-national_registry_gateway_inputs-DLQ --inputFile ./input.json`;

    const args = parseArgs({
        options: {
            accountType: { type: 'string', short: 'a' },
            envName: { type: 'string', short: 'e' },
            queueName: { type: 'string', short: 'q' },
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
    // Check first character
    if (fileRows.charAt(0) === '[') {
        const jsonArray = JSON.parse(fileRows);
        return (jsonArray);
    } else {
        // Add commas between JSON objects and enclose everything in square brackets
        const jsonInLine = '[' + fileRows.replace(/}\n{/g, '},\n{') + ']';
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
    while (msgsToRepublish.length > 0) {
        let singleBlockOfMsgs = [];
        msgsToRepublish.slice(0, 10).forEach(json => {
            let msg = {
                Id: randomUUID(),
                MessageBody: json.Body
            };
            json.MessageAttributes ? msg.MessageAttributes = json.MessageAttributes : null;
            singleBlockOfMsgs.push(msg);
        });
        allBlocksOfMsgs.push(singleBlockOfMsgs);
        msgsToRepublish.splice(0, 10);
    };
    return (allBlocksOfMsgs);
};

/**
 * Creating an output file on error
 * @param {string} envName - envName
 * @param {string} outputFile - Target file name
 * @param {array} data - JSON data to write (message not write)
 */
function writeInFile(folderName, fileName, data) {
    // Create directory if it doesn't exist
    const path = ('./result/' + folderName + '/' + fileName);
    const dir = dirname(path);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Writing error messages to file
    appendFileSync(path, JSON.stringify(data) + "\n", 'utf-8');
};

async function main() {
    // Parse and validate arguments
    const args = validateArgs();
    const { accountType, envName, queueName, inputFile } = args.values;
    // Initialize AWS client
    const clientSQS = new AwsClientsWrapper(accountType, envName);
    clientSQS._initSQS();
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const folderName = timestamp + "_" + envName;
    // GetQueueUrlRequest
    const queueUrl = await clientSQS._getQueueUrl(queueName);
    // Process input file
    const msgsList = formatFile(inputFile);
    const totMsgs = msgsList.length;
    // Group msgs into blocks of 10 elements and store these blocks in an overall object
    const allBlocksOfMsgs = formatInput(msgsList);
    let run = 0;
    let msgsOK = 0;
    let msgsKO = 0;
    // Execute the batch
    for (block of allBlocksOfMsgs) {
        try {
            let result = await clientSQS._sendSQSMessageBatch(queueUrl, block);
            if (result.Failed) {
                    // Create the output format
                    result.Failed.forEach(json => {
                        let failure = {
                            Id: json.Id,
                            Code: json.Code,
                            Error: json.Message,
                            Body: block.find(msgs => msgs.Id === json.Id)?.MessageBody,
                            MessageAttributes: block.find(msgs => msgs.Id === json.Id)?.MessageAttributes
                        }
                        writeInFile(folderName, 'msg_not_resubmitted_' + queueName + '.json', failure);
                    });
                    console.log('\nFailed resubmission of ' + result.Failed.length + ' messages\n');
                    msgsKO = msgsKO + result.Failed.length;
                    msgsOK = result.Successful ? msgsOK + result.Successful.length : msgsOK + 0;
            }
            else {
                console.log('\nAll ' + block.length + ' msgs of block ' + run + ' have been successfully resubmit');
                msgsOK = msgsOK + result.Successful.length;
            }
        }
        catch (err) {
            console.log('\n');
            console.error('\nError while resubmit ' + block.length + ' msgs in the block ' + run, JSON.stringify(err, null, 2));
            msgsKO = result.Failed ? msgsKO + result.Failed.length : msgsKO + 0;
            msgsOK = result.Successful ? msgsOK + result.Successful.length : msgsOK + 0;
        }
        run++
    };
    console.log('\nNumber of msgs OK  --> ' + msgsOK);
    console.log('Number of msgs KO  --> ' + msgsKO);
    console.log('TOT number of msgs --> ' + totMsgs);
    console.log('\n');
};

main();