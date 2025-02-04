const { AwsClientsWrapper } = require('pn-common');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { parseArgs } = require('util');

const VALID_ENVIRONMENTS = ['dev', 'test', 'uat', 'hotfix', 'prod'];

function validateArgs() {
    const usage = `
Usage: node delete_attachment_future_action.js --envName|-e <environment> --dumpFile|-f <path>

Parameters:
    --envName, -e     Required. Environment to check (dev|test|uat|hotfix|prod)
    --dumpFile, -f    Required. Path to the SQS dump file containing filtered messages
    --help, -h        Display this help message`;

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

    if (!existsSync(args.values.dumpFile)) {
        console.error(`Error: Dump file not found: ${args.values.dumpFile}`);
        process.exit(1);
    }

    return args;
}

/**
 * Tests SSO credentials for AWS client
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper
 * @returns {Promise<void>}
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
 * Prints execution summary
 * @param {Object} stats - Processing statistics
 */
function printSummary(stats) {
    console.log('\n=== Execution Summary ===');
    console.log(`\nTotal messages processed: ${stats.total}`);
    console.log(`Messages that required updates: ${stats.updated}`);
    console.log(`Messages skipped: ${stats.total - stats.updated}`);
    console.log('\nResults written to:');
    console.log('- Processed messages: result/to-remove.json');
}

/**
 * Query timeline items for a specific IUN
 * @param {string} iun - IUN to query
 * @returns {Promise<Array>} - Timeline items
 */
async function queryTimeline(iun) {
    const items = await awsClient._queryRequest(
        'pn-Timelines',
        'iun',
        iun
    );
    
    return items.Items.map(item => unmarshall(item));
}

/**
 * Check if timeline contains relevant categories
 * @param {Array} timelineItems - Timeline items to check
 * @returns {boolean} - True if relevant categories found
 */
function hasRelevantCategory(timelineItems) {
    const relevantCategories = ['REFINEMENT', 'NOTIFICATION_VIEWED', 'NOTIFICATION_CANCELLED'];
    return timelineItems.some(item => relevantCategories.includes(item.category));
}

/**
 * Update future actions for an IUN
 * @param {string} iun - IUN to process
 */
async function updateFutureActions(iun) {
    // Query future actions with matching IUN
    const futureActions = await awsClient._queryRequest(
        'pn-FutureAction',
        'iun',
        iun,
        'iun-index'
    );

    // Filter and update matching actions
    for (const action of futureActions.Items) {
        const item = unmarshall(action);
        if (item.actionId?.startsWith('check_attachment_retention_iun')) {
            await awsClient._dynamoClient.updateItem({
                TableName: 'pn-FutureAction',
                Key: {
                    actionId: { S: item.actionId },
                    timeSlot: { S: item.timeSlot }
                },
                UpdateExpression: 'SET logicalDeleted = :deleted',
                ExpressionAttributeValues: {
                    ':deleted': { BOOL: true }
                }
            });
        }
    }
}

/**
 * Extract MD5 fields from message
 * @param {Object} message - Message to process
 * @returns {Object} - MD5 fields
 */
function extractMD5Fields(message) {
    const result = { MD5OfBody: message.MD5OfBody };
    if (message.MD5OfMessageAttributes) {
        result.MD5OfMessageAttributes = message.MD5OfMessageAttributes;
    }
    return result;
}

/**
 * Main processing function
 */
async function main() {
    try {
        const args = validateArgs();
        const stats = {
            total: 0,
            updated: 0
        };

        // Initialize and test AWS client
        const awsClient = new AwsClientsWrapper('core', args.values.envName);
        await testSsoCredentials(awsClient);
        awsClient._initDynamoDB();

        // Ensure output directory exists
        if (!existsSync('result')) {
            mkdirSync('result');
        }

        // Read and parse messages
        const messages = readFileSync(args.values.dumpFile, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));

        stats.total = messages.length;
        console.log(`\nStarting processing of ${stats.total} messages...`);
        let progress = 0;

        // Process messages
        for (const message of messages) {
            progress++;
            process.stdout.write(`\rProcessing message ${progress} of ${stats.total}`);

            const iun = message.MessageAttributes.iun.StringValue;
            const timelineItems = await queryTimeline(awsClient, iun);
            
            if (hasRelevantCategory(timelineItems)) {
                await updateFutureActions(awsClient, iun);
                writeFileSync('result/to-remove.json', 
                    JSON.stringify(extractMD5Fields(message)) + '\n', 
                    { flag: 'a' });
                stats.updated++;
            }
        }

        process.stdout.write('\n'); // New line after progress
        printSummary(stats);

    } catch (error) {
        console.error('Error during execution:', error);
        process.exit(1);
    }
}

// Start execution with error handling
main().catch(console.error);