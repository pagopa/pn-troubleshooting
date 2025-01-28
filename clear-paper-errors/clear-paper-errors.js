import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { AwsClientsWrapper } from "pn-common";
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { parseArgs } from 'util';

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node analyze-paper-channel-dlq.js --envName|-e <environment> --dumpFile|-f <path>

Description:
    Analyzes paper channel delivery requests and checks their cancellation status.

Parameters:
    --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
    --dumpFile, -f    Required. Path to the DynamoDB dump file
    --help, -h        Display this help message

Example:
    node analyze-paper-channel-dlq.js --envName dev --dumpFile ./dump.json`;

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

    return args;
}

/**
 * Tests SSO credentials for AWS client
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper
 */
async function testSsoCredentials(awsClient) {
    try {
        awsClient._initSTS();
        await awsClient._getCallerIdentity();
    } catch (error) {
        if (error.name === 'CredentialsProviderError' || 
            error.message?.includes('expired') || 
            error.message?.includes('credentials')) {
            console.error('\n=== SSO Authentication Error ===');
            console.error('Your SSO session has expired or is invalid.');
            console.error('Please run the following commands:');
            console.error('1. aws sso logout');
            console.error(`2. aws sso login --profile ${awsClient.ssoProfile}`);
            process.exit(1);
        }
        throw error;
    }
}

/**
 * Process DynamoDB dump file
 * @param {string} dumpFilePath - Path to dump file
 * @returns {Array} Array of parsed entries
 */
function processDynamoDBDump(dumpFilePath) {
    try {
        const entries = readFileSync(dumpFilePath, 'utf-8')
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));

        console.log(`Processing ${entries.length} entries from dump file`);
        return entries;
    } catch (error) {
        console.error('Error reading/parsing dump file:', error);
        process.exit(1);
    }
}

/**
 * Extracts IUN from requestId
 * @param {string} requestId - Request ID containing IUN
 * @returns {string|null} IUN if found, null otherwise
 */
function extractIunFromRequestId(requestId) {
    try {
        const parts = requestId.split('.');
        if (parts.length < 2) return null;
        
        const iunPart = parts[1];
        if (!iunPart.startsWith('IUN_')) return null;
        
        return iunPart.substring(4); // Remove 'IUN_' prefix
    } catch (error) {
        return null;
    }
}

/**
 * Check if notification is cancelled
 * @param {AwsClientsWrapper} awsClient 
 * @param {string} requestId 
 */
async function checkNotificationStatus(awsClient, requestId) {
    try {
        const iun = extractIunFromRequestId(requestId);
        
        if (!iun) {
            return { success: false, reason: 'Could not extract IUN from requestId' };
        }

        // Query Timelines table
        const timelineItems = await awsClient._queryRequest(
            'pn-Timelines',
            'iun',
            iun
        );

        if (!timelineItems?.Items) {
            return { success: false, reason: 'No timeline items found' };
        }

        // Check for cancelled notification
        const items = timelineItems.Items.map(item => unmarshall(item));
        const isCancelled = items.some(item => 
            item.timelineElementId === requestId && 
            item.category === 'NOTIFICATION_CANCELLED'
        );

        return {
            success: true,
            iun,
            isCancelled
        };

    } catch (error) {
        return { success: false, reason: error.message };
    }
}

/**
 * Appends a JSON object as a new line to a file
 * @param {string} fileName - Target file path
 * @param {object} data - JSON data to append
 */
function appendJsonToFile(fileName, data) {
    // Create directory if it doesn't exist
    const dir = dirname(fileName);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Append JSON string with newline
    appendFileSync(fileName, JSON.stringify(data) + "\n");
}

/**
 * Print execution summary
 * @param {Object} stats - Statistics object
 */
function printSummary(stats) {
    console.log('\n=== Execution Summary ===');
    console.log(`\nTotal entries processed: ${stats.total}`);
    console.log(`Safe to delete: ${stats.safeToDelete}`);
    console.log(`Cannot delete: ${stats.cannotDelete}`);
    console.log('\nResults written to:');
    console.log('- Safe to delete entries: results/safe_to_delete.json');
    console.log('- Cannot delete entries: results/cannot_delete.json');
}

async function main() {
    // Parse and validate arguments
    const args = validateArgs();
    const { envName, dumpFile } = args.values;

    const stats = {
        total: 0,
        safeToDelete: 0,
        cannotDelete: 0
    };

    // Initialize AWS client
    const coreClient = new AwsClientsWrapper('core', envName);
    await testSsoCredentials(coreClient);
    coreClient._initDynamoDB();

    // Process dump file
    const entries = processDynamoDBDump(dumpFile);
    stats.total = entries.length;

    console.log('\nChecking notification status...');
    let progress = 0;

    // Process each entry
    for (const entry of entries) {
        progress++;
        process.stdout.write(`\rProcessing entry ${progress} of ${stats.total}`);

        const requestId = entry.requestId;
        if (!requestId) {
            stats.cannotDelete++;
            appendJsonToFile('results/cannot_delete.json', { 
                requestId: entry.requestId || 'MISSING',
                reason: 'Missing requestId' 
            });
            continue;
        }

        const result = await checkNotificationStatus(coreClient, requestId);

        if (result.success && result.isCancelled) {
            stats.safeToDelete++;
            appendJsonToFile('results/safe_to_delete.json', { requestId });
        } else {
            stats.cannotDelete++;
            appendJsonToFile('results/cannot_delete.json', { 
                requestId,
                reason: result.success ? 'Not cancelled' : result.reason
            });
        }
    }
    
    printSummary(stats);
}

// Start execution with error handling
main().catch(console.error);