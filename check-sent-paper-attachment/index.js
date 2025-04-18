import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { parseArgs } from 'util';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AwsClientsWrapper } from "pn-common";

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];
const VALID_QUEUES = ['pn-ec-availabilitymanager-queue-DLQ', 'pn-ss-transformation-raster-queue-DLQ'];

function validateArgs() {
    const usage = `
Usage: node index.js --envName|-e <environment> --dumpFile|-f <path> --queueName|-q <queue>

Description:
    Analyzes SQS messages and validates paper address status.

Parameters:
    --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
    --dumpFile, -f    Required. Path to the SQS dump file
    --queueName, -q    Required. Source SQS queue (${VALID_QUEUES.join('|')})
    --help, -h        Display this help message

Example:
    node index.js --envName dev --dumpFile ./dump.json --queueName pn-ec-availabilitymanager-queue-DLQ`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            dumpFile: { type: "string", short: "f" },
            queueName: { type: "string", short: "q" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.envName || !args.values.dumpFile || !args.values.queueName) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);
    }

    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }

    if (!VALID_QUEUES.includes(args.values.queueName)) {
        console.error(`Error: Invalid queue. Must be one of: ${VALID_QUEUES.join(', ')}`);
        process.exit(1);
    }

    return args.values;
}

async function checkPaperStatus(awsClient, fileKey, message) {
    try {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const sentTimestamp = Math.floor(Number(message.Attributes.SentTimestamp) / 1000);
        const queryString = `fields @timestamp, cx_id
| sort @timestamp asc
| filter message like '${fileKey}'`;

        const logs = await awsClient._executeCloudwatchQuery(
            ['/aws/ecs/pn-external-channel'],
            sentTimestamp - (5 * 60),
            currentTimestamp,
            queryString,
            1
        );

        if (!logs?.length || !logs[0]?.length) {
            return { success: false, reason: 'No logs found for fileKey', requestId: null };
        }

        // Find the cx_id field in the log entry
        const cxIdField = logs[0].find(field => field.field === 'cx_id');
        if (!cxIdField?.value) {
            return { success: false, reason: 'No cx_id found in logs', requestId: null };
        }

        const requestId = cxIdField.value;

        // Query metadata table with the found requestId
        const metadataResult = await awsClient._queryRequest(
            'pn-EcRichiesteMetadati',
            'requestId',
            requestId
        );

        if (!metadataResult?.Items?.[0]) {
            return { success: false, reason: 'requestId not found on pn-EcRichiesteMetadati', requestId };
        }

        const metadata = unmarshall(metadataResult.Items[0]);
        
        // Check for 'sent' status in eventsList
        const hasSentStatus = metadata.eventsList?.some(event => 
            event?.paperProgrStatus?.status === 'sent'
        );

        return {
            success: hasSentStatus,
            reason: hasSentStatus ? null : 'No sent status found in eventsList of requestId on pn-EcRichiesteMetadati',
            requestId
        };

    } catch (error) {
        console.error('Error checking paper status:', error);
        return { success: false, reason: `Error: ${error.message}`, requestId: null };
    }
}

function logResult(message, checkResult, queueName, timestamp) {
    if (checkResult.success) {
        // For successful checks, just log MD5 fields
        const outputData = { 
            MD5OfBody: message.MD5OfBody,
            ...(message.MD5OfMessageAttributes && { MD5OfMessageAttributes: message.MD5OfMessageAttributes })
        };
        appendFileSync(`results/safe_to_delete_${queueName}_${timestamp}.json`, JSON.stringify(outputData) + '\n');
    } else {
        // Ensure the requestId has a single prefix
        let formattedRequestId = null;
        if (checkResult.requestId) {
            formattedRequestId = checkResult.requestId.startsWith('pn-cons-000~')
                ? checkResult.requestId
                : `pn-cons-000~${checkResult.requestId}`;
        }
        // For failed checks, log the required fields
        const outputData = {
            fileKey: message.parsedFileKey,
            requestId: formattedRequestId,
            failureReason: checkResult.reason
        };
        appendFileSync(`results/need_further_analysis_${queueName}_${timestamp}.json`, JSON.stringify(outputData) + '\n');
    }
}

function processSQSDump(dumpFilePath, queueName) {
    try {
        const content = readFileSync(dumpFilePath, 'utf-8');
        const messages = JSON.parse(content);

        return messages.map(message => {
            try {
                let fileKey;
                if (queueName === 'pn-ec-availabilitymanager-queue-DLQ') {
                    const body = JSON.parse(message.Body);
                    fileKey = body?.detail?.key;
                } else if (queueName === 'pn-ss-transformation-raster-queue-DLQ') {
                    const body = JSON.parse(message.Body);
                    fileKey = body?.fileKey;
                }

                if (!fileKey) {
                    console.warn('Missing or invalid fileKey in message:', message.MessageId);
                    return null;
                }

                return {
                    ...message,
                    parsedFileKey: fileKey
                };
            } catch (err) {
                console.warn('Error parsing message:', err);
                return null;
            }
        }).filter(Boolean);
    } catch (error) {
        console.error('Error reading/parsing dump file:', error);
        process.exit(1);
    }
}

function printSummary(stats) {
    console.log('\n=== Execution Summary ===');
    console.log(`\nTotal messages processed: ${stats.total}`);
    console.log(`Messages that passed: ${stats.passed}`);
    console.log(`Messages that failed: ${stats.total - stats.passed}`);
    console.log('\nResults written to results/ directory');
}

async function main() {
    const { envName, dumpFile, queueName } = validateArgs();
    const startTime = new Date().toISOString().replace(/[:.]/g, '-');

    const stats = {
        total: 0,
        passed: 0
    };

    // Initialize AWS client
    const awsClient = new AwsClientsWrapper('confinfo', envName);
    awsClient._initDynamoDB();
    awsClient._initCloudwatch();

    // Create results directory
    if (!existsSync('results')) {
        mkdirSync('results');
    }

    // Process dump file
    const messages = processSQSDump(dumpFile, queueName);
    stats.total = messages.length;

    console.log(`\nStarting validation checks for ${stats.total} messages...`);
    let progress = 0;

    // Process each message
    for (const message of messages) {
        progress++;
        process.stdout.write(`\rChecking message ${progress} of ${stats.total}`);

        const checkResult = await checkPaperStatus(awsClient, message.parsedFileKey, message);

        if (checkResult.success) {
            stats.passed++;
            logResult(message, checkResult, queueName, startTime);
        } else {
            logResult(message, checkResult, queueName, startTime);
        }
    }

    process.stdout.write('\n');
    printSummary(stats);
}

main().catch(console.error);
