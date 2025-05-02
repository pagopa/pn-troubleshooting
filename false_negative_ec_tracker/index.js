import { parseArgs } from 'util';
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { AwsClientsWrapper } from "pn-common";
import { unmarshall } from '@aws-sdk/util-dynamodb';

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];
const CHANNEL_TYPES = ['email', 'pec', 'cartaceo', 'sms'];
const ANALOG_STATUS_REQUEST = [
    "RECRS006", "RECRN006", "RECAG004", "RECRI005", "RECRSI005",
    "RECRS013", "RECRN013", "RECAG013", "PN999"
];

let toRemoveFilename, problemFoundFilename, toKeepFilename, errorFilename;

function printUsage() {
    const usage = `
Usage: node index.js --envName|-e <environment> --fileName|-f <path> --channelType|-c <channel>

Description:
    Analyzes EC tracker DLQ events and checks related metadata for events that can be safely removed.

Parameters:
    --envName, -e      Required. Environment to check (dev|uat|test|prod|hotfix)
    --fileName, -f     Required. Path to the SQS dump file
    --channelType, -c  Required. Channel type (email|pec|cartaceo|sms)
    --help, -h         Display this help message

Example:
    node index.js --envName dev --fileName ./dump.json --channelType pec
`;
    console.log(usage);
}

function validateArgs() {
    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            fileName: { type: "string", short: "f" },
            channelType: { type: "string", short: "c" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        printUsage();
        process.exit(0);
    }

    if (!args.values.envName || !args.values.fileName || !args.values.channelType) {
        console.error("Error: Missing required parameters --envName, --fileName and/or --channelType");
        printUsage();
        process.exit(1);
    }

    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }

    if (!CHANNEL_TYPES.includes(args.values.channelType)) {
        console.error(`Error: Invalid channelType. Must be one of: ${CHANNEL_TYPES.join(', ')}`);
        process.exit(1);
    }

    return args;
}

function ensureResultsDir() {
    if (!existsSync('results')) mkdirSync('results');
}

function getTimestamp() {
    return new Date().toISOString().replace(/:/g, '-').replace('.', '-');
}

function appendJsonToFile(fileName, data) {
    appendFileSync(fileName, JSON.stringify(data) + "\n");
}

function printSummary(stats, channelType) {
    console.log('\n=== Execution Summary ===');
    console.log(`\nTotal messages processed: ${stats.total}`);
    console.log(`To remove: ${stats.toRemove}`);
    console.log(`Problems found: ${stats.problemFound}`);
    console.log(`Kept: ${stats.toKeep}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('\nResults written to:');
    console.log(`- To remove: ${toRemoveFilename}`);
    console.log(`- Problems found: ${problemFoundFilename}`);
    console.log(`- Kept: ${toKeepFilename}`);
    console.log(`- Errors: ${errorFilename}`);
}

async function initializeAwsClients(awsClient) {
    awsClient._initSQS();
    awsClient._initDynamoDB();
    awsClient._initSTS();
    return {
        sqsClient: awsClient._sqsClient,
        dynamoDBClient: awsClient._dynamoClient,
        stsClient: awsClient._stsClient
    };
}

function processSQSDump(fileName) {
    try {
        const fileContent = readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
        const messages = JSON.parse(fileContent).filter(x => x != '');
        console.log(`Processing ${messages.length} messages from dump file`);
        return messages;
    } catch (error) {
        console.error('Error reading/parsing dump file:', error);
        process.exit(1);
    }
}

function checkStatusRequest(statusRequest) {
    return ANALOG_STATUS_REQUEST.includes(statusRequest?.toUpperCase());
}

function retrieveNextStatus(message) {
    try {
        return typeof message.Body === 'string'
            ? JSON.parse(message.Body).nextStatus
            : message.Body.nextStatus;
    } catch {
        return undefined;
    }
}

function checkingEventsList(eventsList, type) {
    const map = type === 'pec'
        ? { booked: false, sent: false, accepted: false }
        : (type === 'email' || type === 'sms')
            ? { booked: false, sent: false }
            : null;
    if (!map) return false;
    for (const e of eventsList) {
        map[e.digProgrStatus.status] = true;
    }
    if (type === 'pec') {
        if ('delivered' in map || 'notDelivered' in map) {
            for (const param in map) {
                if (!map[param]) return false;
            }
        } else {
            return false;
        }
        return true;
    } else {
        for (const param in map) {
            if (!map[param]) return false;
        }
        return true;
    }
}

function logResult(message, status, reason = '', channelType, extra = {}) {
    const clonedMessage = JSON.parse(JSON.stringify(message));
    if (typeof clonedMessage.Body === 'string') {
        try {
            clonedMessage.Body = JSON.parse(clonedMessage.Body);
        } catch {}
    }
    if (status === 'toRemove') {
        appendJsonToFile(toRemoveFilename, { ...clonedMessage, ...extra });
    } else if (status === 'problemFound') {
        clonedMessage.problemReason = reason;
        appendJsonToFile(problemFoundFilename, { ...clonedMessage, ...extra });
    } else if (status === 'toKeep') {
        appendJsonToFile(toKeepFilename, { ...clonedMessage, ...extra });
    } else if (status === 'error') {
        clonedMessage.errorReason = reason;
        appendJsonToFile(errorFilename, { ...clonedMessage, ...extra });
    }
}

async function main() {
    const args = validateArgs();
    const { envName, fileName, channelType } = args.values;

    ensureResultsDir();
    const timestamp = getTimestamp();
    toRemoveFilename = `results/to_remove_${channelType}_${timestamp}.json`;
    problemFoundFilename = `results/problem_found_${channelType}_${timestamp}.json`;
    toKeepFilename = `results/to_keep_${channelType}_${timestamp}.json`;
    errorFilename = `results/error_${channelType}_${timestamp}.json`;

    const stats = {
        total: 0,
        toRemove: 0,
        problemFound: 0,
        toKeep: 0,
        errors: 0
    };

    const awsClient = new AwsClientsWrapper('confinfo', envName);

    await initializeAwsClients(awsClient);

    const messages = processSQSDump(fileName);
    stats.total = messages.length;

    const requestIdsMap = {};
    for (const fileData of messages) {
        try {
            const body = typeof fileData.Body === 'string' ? JSON.parse(fileData.Body) : fileData.Body;
            if (body.paperProgressStatusDto && body.paperProgressStatusDto.statusCode?.startsWith("CON020")) {
                logResult(fileData, 'problemFound', 'CON020 found');
                stats.problemFound++;
                continue;
            }
            const requestId = `${body.xpagopaExtchCxId}~${body.requestIdx}`;
            if (!requestIdsMap[requestId]) requestIdsMap[requestId] = [];
            requestIdsMap[requestId].push(fileData);
        } catch (err) {
            logResult(fileData, 'error', `Body parse error: ${err.message}`);
            stats.errors++;
        }
    }

    let progress = 0;
    const requestIds = Object.keys(requestIdsMap);
    for (const requestId of requestIds) {
        progress++;
        process.stdout.write(`\rProcessing requestId ${progress} of ${requestIds.length}`);
        let res;
        try {
            res = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", requestId);
        } catch (err) {
            for (const row of requestIdsMap[requestId]) {
                logResult(row, 'error', `DynamoDB query error: ${err.message}`);
                stats.errors++;
            }
            continue;
        }
        if (res.Items.length > 0) {
            const metadata = unmarshall(res.Items[0]);
            if (channelType === 'cartaceo') {
                if (checkStatusRequest(metadata.statusRequest)) {
                    for (const row of requestIdsMap[requestId]) {
                        logResult(row, 'toRemove');
                        stats.toRemove++;
                    }
                } else {
                    for (const row of requestIdsMap[requestId]) {
                        logResult(row, 'toKeep');
                        stats.toKeep++;
                    }
                }
            } else {
                if (checkingEventsList(metadata.eventsList, channelType)) {
                    for (const row of requestIdsMap[requestId]) {
                        const nextStatus = retrieveNextStatus(row);
                        const found = metadata.eventsList.some(item => item.digProgrStatus?.status === nextStatus);
                        if (!found) {
                            logResult(row, 'problemFound', `NextStatus not found in eventList: ${nextStatus}`);
                            stats.problemFound++;
                        } else {
                            logResult(row, 'toRemove');
                            stats.toRemove++;
                        }
                    }
                } else {
                    for (const row of requestIdsMap[requestId]) {
                        logResult(row, 'toKeep');
                        stats.toKeep++;
                    }
                }
            }
        } else {
            for (const row of requestIdsMap[requestId]) {
                logResult(row, 'error', `requestId ${requestId} not found`);
                stats.errors++;
            }
        }
    }

    process.stdout.write('\n');
    printSummary(stats, channelType);
}

main().catch(err => {
    console.error('\nUnexpected error:', err);
    process.exit(1);
});