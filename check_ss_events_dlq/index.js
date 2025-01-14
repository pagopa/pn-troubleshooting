// --- Required Dependencies ---
import { existsSync, mkdirSync, appendFileSync } from 'fs';             // File system operations
import { dirname } from 'path';                                         // Path manipulation utilities
import { AwsClientsWrapper } from "pn-common";                          // AWS services wrapper
import { unmarshall } from '@aws-sdk/util-dynamodb';                    // DynamoDB response parser
import { parseArgs } from 'util';                                       // Command line argument parser
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];    // Valid environment names

/**
 * Validates command line arguments and displays usage information
 * @returns {Object} Parsed and validated arguments
 * @throws {Error} If required arguments are missing or invalid
 */
function validateArgs() {
    const usage = `
Usage: node index.js --envName|-e <environment>

Description:
    Analyzes DLQ messages from SafeStorage events queue and validates related resources.

Parameters:
    --envName, -e    Required. Environment to check (dev|uat|test|prod|hotfix)
    --help, -h       Display this help message

Example:
    node index.js --envName dev
    node index.js -e prod`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    // Show help and exit
    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    // Validate required parameters
    if (!args.values.envName) {
        console.error("Error: Missing required parameter --envName");
        console.log(usage);
        process.exit(1);
    }

    // Validate environment value
    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }

    return args;
}

/**
 * Appends a JSON object as a new line to a file
 * @param {string} fileName - Target file path
 * @param {object} data - JSON data to append
 * Creates the directory structure if it doesn't exist
 */
function appendJsonToFile(fileName, data) {
    const dir = dirname(fileName);
    // Ensure target directory exists
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    // Append JSON string with newline
    appendFileSync(fileName, JSON.stringify(data) + "\n");
}

/**
 * Retrieves the current AWS Account ID
 * @param {AwsClientsWrapper} awsClient - Initialized AWS client
 * @returns {Promise<string>} AWS Account ID
 */
async function getAccountId(awsClient) {
    const stsClient = awsClient._initSTS();
    const identity = (await awsClient._getCallerIdentity());
    console.log(`Current AWS Account ID: ${identity.Account}`);
    return identity.Account;
}

/**
 * Retrieves all messages from the DLQ and saves them to a file
 * @param {AwsClientsWrapper} awsClient - Initialized AWS client
 * @returns {Array} Array of parsed message bodies
 */
async function dumpSQSMessages(awsClient) {
    // Ensure temp directory exists
    if (!existsSync('temp')) {
        mkdirSync('temp');
    }

    awsClient._initSQS();
    const queueUrl = await awsClient._getQueueUrl('pn-ss-main-bucket-events-queue-DLQ');
    console.log(`SQS Queue URL: ${queueUrl}`);

    // Get queue attributes to count messages
    const queueAttributes = await awsClient._getQueueAttributes(queueUrl);
    console.log(`Total messages in queue: ${queueAttributes.Attributes.ApproximateNumberOfMessages}`);

    const maxNumberOfMessages = 10;
    const visibilityTimeout = 30;
    let messages = [];
    let totalMessages = 0;

    // Keep polling until no more messages are available
    while (true) {
        const response = await awsClient._receiveMessages(queueUrl, maxNumberOfMessages, visibilityTimeout);

        // Exit loop when no more messages
        if (!response.Messages || response.Messages.length === 0) break;

        // Parse message bodies from JSON string to objects
        messages = messages.concat(response.Messages.map(m => JSON.parse(m.Body)));
        totalMessages += response.Messages.length;
        appendJsonToFile('temp/sqs_dump.txt', messages);
    }

    console.log(`Total messages processed: ${totalMessages}`);
    return messages;
}

/**
 * Verifies S3 object presence in the correct buckets
 * @param {AwsClientsWrapper} awsClient - Initialized AWS client
 * @param {string} fileKey - S3 object key to check
 * @param {string} accountId - AWS Account ID for bucket names
 * @returns {Promise<boolean>} True if object exists in main bucket but not in staging
 */
async function checkS3Objects(awsClient, fileKey, accountId) {
    awsClient._initS3();

    const mainBucket = `pn-safestorage-eu-south-1-${accountId}`;
    const stagingBucket = `pn-safestorage-staging-eu-south-1-${accountId}`;

    console.log(`Searching for object with key: ${fileKey}`);

    try {
        // Check if object exists in main bucket
        await awsClient.s3.headObject({
            Bucket: mainBucket,
            Key: fileKey
        });

        console.log(`Found object "${fileKey}" in main bucket ${mainBucket}`);

        try {
            // Check if object exists in staging bucket (shouldn't)
            await awsClient.s3.headObject({
                Bucket: stagingBucket,
                Key: fileKey
            });
            return false; // Failed: Object exists in staging bucket
        } catch (e) {
            return true;  // Success: Object doesn't exist in staging bucket
        }
    } catch (e) {
        return false; // Failed: Object doesn't exist in main bucket
    }
}

/**
 * Validates document state in DynamoDB
 * @param {AwsClientsWrapper} awsClient - Initialized AWS client
 * @param {string} fileKey - Document key to check
 * @returns {Promise<boolean>} True if document state matches expected value
 */
async function checkDocumentState(awsClient, fileKey) {
    awsClient._initDynamoDB();

    // Search for document by key
    const result = await awsClient._scanRequest('pn-SsDocumenti', {
        FilterExpression: 'contains(documentKey, :key)',
        ExpressionAttributeValues: { ':key': fileKey }
    });

    if (!result.Items.length) return false;

    console.log('Raw DynamoDB Item:', JSON.stringify(result.Items[0], null, 2));

    const item = unmarshall(result.Items[0]);
    console.log('Unmarshalled Item:', JSON.stringify(item, null, 2));

    // Extract prefix and log document details
    const prefix = fileKey.split('_')[0] + '_' + fileKey.split('_')[1];
    console.log('Document Analysis:', {
        name: fileKey,
        prefix: prefix,
        expectedState: fileKey.startsWith('PN_AAR') || fileKey.startsWith('PN_LEGAL_FACTS')
            ? 'SAVED'
            : fileKey.startsWith('PN_NOTIFICATION_ATTACHMENT') || fileKey.startsWith('PN_PRINTED')
                ? 'ATTACHED'
                : 'UNKNOWN'
    });

    // Determine expected state based on document type prefix
    const expectedState = fileKey.startsWith('PN_AAR') || fileKey.startsWith('PN_LEGAL_FACTS')
        ? 'SAVED'
        : fileKey.startsWith('PN_NOTIFICATION_ATTACHMENT') || fileKey.startsWith('PN_PRINTED')
            ? 'ATTACHED'
            : null;

    return item.documentLogicalState === expectedState;
}

/**
 * Validates document timeline status
 * @param {AwsClientsWrapper} coreAwsClient - Initialized AWS client for core services
 * @param {string} fileKey - Document key to check
 * @returns {Promise<boolean>} True if timeline status is valid
 */
async function checkTimeline(coreAwsClient, fileKey) {
    coreAwsClient._initDynamoDB();

    console.log('Searching document with key:', fileKey);

    // Scan document creation request table for matching key
    const docRequest = await coreAwsClient._scanRequest('pn-DocumentCreationRequestTable', {
        FilterExpression: 'contains(#key, :key)',
        ExpressionAttributeNames: { '#key': 'key' },
        ExpressionAttributeValues: { ':key': fileKey }
    });

    if (!docRequest.Items.length) return false;

    // Extract IUN and timeline ID
    const request = unmarshall(docRequest.Items[0]);
    console.log('Found document with complete key:', request.key);
    const { iun, timelineId } = request;
    console.log('Document details:', {
        iun: iun,
        timelineId: timelineId
    });


    // Get timeline entries and sort by timestamp
    const timeline = await coreAwsClient._queryRequest('pn-Timelines', 'iun', iun);
    const sortedTimeline = timeline.Items
        .map(i => unmarshall(i))
        .sort((a, b) => b.timestamp - a.timestamp);

    console.log('Timeline analysis:', {
        latestTimestamp: new Date(sortedTimeline[0].timestamp).toISOString(),
        checkingTimestamp: new Date(sortedTimeline.find(t => t.timelineId === timelineId)?.timestamp).toISOString()
    });

    // Check if current timeline entry isn't the latest
    return sortedTimeline[0].timelineId !== timelineId;
}

/**
 * Main execution function
 * Processes DLQ messages and performs validation checks
 */
async function main() {
    const args = validateArgs();
    const { envName } = args.values;

    // Initialize AWS clients and get account ID
    const confinfoAwsClient = new AwsClientsWrapper('confinfo', envName);
    const accountId = await getAccountId(confinfoAwsClient);

    // Dump and process DLQ messages
    const messages = dumpSQSMessages(confinfoAwsClient);

    // Process each message
    for (const message of messages) {
        // Extract S3 object key from message
        const fileKey = message.Records?.[0]?.s3?.object?.key;
        if (!fileKey) continue;

        // Perform validation checks
        const s3Check = await checkS3Objects(confinfoAwsClient, fileKey, accountId);
        const docStateCheck = await checkDocumentState(confinfoAwsClient, fileKey);

        const coreAwsClient = new AwsClientsWrapper('core', envName);
        const timelineCheck = await checkTimeline(coreAwsClient, fileKey);

        // Log results to appropriate file
        if (!s3Check || !docStateCheck || !timelineCheck) {
            appendJsonToFile('results/errors.json', message);
        } else {
            appendJsonToFile('results/ok.json', message);
        }
    }
}

// Start execution with error handling
main().catch(console.error);