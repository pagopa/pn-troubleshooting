import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs';
import { parseArgs } from 'util';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AwsClientsWrapper } from "pn-common";

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

function validateArgs() {
    const usage = `
Usage: node index.js --envName|-e <environment> --dumpFile|-f <path>

Description:
    Analyzes SQS messages and validates paper address status.

Parameters:
    --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
    --dumpFile, -f    Required. Path to the SQS dump file
    --help, -h        Display this help message

Example:
    node index.js --envName dev --dumpFile ./dump.json`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            dumpFile: { type: "string", short: "f" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.envName || !args.values.dumpFile) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);
    }

    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
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

function logResult(message, checkResult) {
    const currentDate = new Date().toISOString().split('T')[0];
    
    if (checkResult.success) {
        // For successful checks, just log MD5 fields
        const outputData = { 
            MD5OfBody: message.MD5OfBody,
            ...(message.MD5OfMessageAttributes && { MD5OfMessageAttributes: message.MD5OfMessageAttributes })
        };
        appendFileSync(`results/to_remove_${currentDate}.json`, JSON.stringify(outputData) + '\n');
    } else {
        // For failed checks, log only the required fields
        const outputData = {
            fileKey: message.parsedFileKey,
            requestId: checkResult.requestId ? `pn-cons-000~${checkResult.requestId}` : null,
            failureReason: checkResult.reason
        };
        appendFileSync(`results/to_keep_${currentDate}.json`, JSON.stringify(outputData) + '\n');
    }
}

function processSQSDump(dumpFilePath) {
    try {
        const content = readFileSync(dumpFilePath, 'utf-8');
        const messages = JSON.parse(content);

        return messages.map(message => {
            try {
                const body = JSON.parse(message.Body);
                const fileKey = body?.detail?.key;

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
    console.log('\nResults written to:');
    console.log('- Failed checks: results/to_keep.json');
    console.log('- Passed checks: results/to_remove.json');
}

async function main() {
    const { envName, dumpFile } = validateArgs();

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
    const messages = processSQSDump(dumpFile);
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
            logResult(message, checkResult);
        } else {
            logResult(message, checkResult);
        }
    }

    process.stdout.write('\n');
    printSummary(stats);
}

main().catch(console.error);
