// --- Required Dependencies ---
import { existsSync, mkdirSync, appendFileSync } from 'fs';             // File system operations
import { dirname } from 'path';                                         // Path manipulation utilities
import { AwsClientsWrapper } from "pn-common";                          // AWS services wrapper
import { unmarshall } from '@aws-sdk/util-dynamodb';                    // DynamoDB response parser
import { GetItemCommand } from '@aws-sdk/client-dynamodb';              // DynamoDB GetItem command
import { parseArgs } from 'util';                                       // Command line argument parser
import { HeadObjectCommand } from '@aws-sdk/client-s3';                 // S3 HeadObject command
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];    // Valid environment names

/**
 * Validates command line arguments and displays usage information
 * @returns {Object} Parsed and validated arguments
 * @throws {Error} If required arguments are missing or invalid
 */
function validateArgs() {
    const usage = `
Usage: node analyze-safestorage-dlq.js --envName|-e <environment>

Description:
    Analyzes DLQ messages from SafeStorage events queue and validates related documents.

Parameters:
    --envName, -e    Required. Environment to check (dev|uat|test|prod|hotfix)
    --help, -h       Display this help message

Example:
    node analyze-safestorage-dlq.js --envName dev
    node analyze-safestorage-dlq.js -e prod`;

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
 * Initialize all required AWS clients
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper
 * @returns {Object} Initialized clients
 */
async function initializeAwsClients(awsClient) {
    awsClient._initS3();
    awsClient._initDynamoDB();
    awsClient._initSTS();
    awsClient._initSQS();

    return {
        s3Client: awsClient._s3Client,
        dynamoDBClient: awsClient._dynamoClient,
        stsClient: awsClient._stsClient,
        sqsClient: awsClient._sqsClient
    };
}

/**
 * Logs result to appropriate file and console
 * @param {Object} message - Message being processed
 * @param {string} status - Status of processing (error/ok)
 * @param {string} reason - Reason for failure
 */
function logResult(message, status, reason = '') {
    const result = {
        message,
        timestamp: new Date().toISOString(),
        status,
        reason
    };

    const fileName = status === 'error' ? 'results/errors.json' : 'results/ok.json';
    appendJsonToFile(fileName, result);
    console.log(`${status.toUpperCase()}: ${reason || 'All checks passed'}`);
}

/**
 * Prints a summary of the DLQ message processing statistics to the console.
 * @param {Object} stats - The statistics object containing the processing results
 * @param {number} stats.total - Total number of messages processed
 * @param {number} stats.passed - Number of messages that passed all checks
 * @param {number} stats.s3Failed - Number of messages that failed S3 bucket checks
 * @param {number} stats.stateCheckFailed - Number of messages that failed document state checks
 * @param {number} stats.timelineFailed - Number of messages that failed timeline checks
 * @returns {void}
 */
function printSummary(stats) {
    console.log('\n=== Execution Summary ===');
    console.log(`Total messages processed: ${stats.total}`);
    console.log(`Messages that passed all checks: ${stats.passed}`);
    console.log(`Total messages that failed a check: ${stats.total - stats.passed}`);
    console.log('\nFailures breakdown:');
    console.log(`- S3 buckets checks failed: ${stats.s3Failed}`);
    console.log(`- Document state checks failed: ${stats.stateCheckFailed}`);
    console.log(`- Timeline checks failed: ${stats.timelineFailed}`);
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
    const identity = (await awsClient._getCallerIdentity());
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

        // Only take enough messages to reach the limit
        const processedMessages = response.Messages.map(m => JSON.parse(m.Body));

        // Parse message bodies from JSON string to objects
        messages = messages.concat(processedMessages);
        totalMessages += response.Messages.length;
        appendJsonToFile('temp/sqs_dump.txt', processedMessages);

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

    const mainBucket = `pn-safestorage-eu-south-1-${accountId}`;
    const stagingBucket = `pn-safestorage-staging-eu-south-1-${accountId}`;

    console.log(`Searching for S3 object with key: ${fileKey}`);

    try {
        // Check if object exists in main bucket
        await awsClient._s3Client.send(new HeadObjectCommand({
            Bucket: mainBucket,
            Key: fileKey
        }));
        console.log(`Found object "${fileKey}" in main bucket ${mainBucket}`);

        try {
            // Check if object exists in staging bucket (shouldn't)
            await awsClient._s3Client.send(new HeadObjectCommand({
                Bucket: stagingBucket,
                Key: fileKey
            }));
            return false; // Failed: Object exists in staging bucket
        } catch (e) {
            return true;  // Success: Object doesn't exist in staging bucket
        }
    } catch (e) {
        console.log(`Object "${fileKey}" not found in main bucket ${mainBucket}`);
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
    // Input validation
    if (!fileKey || typeof fileKey !== 'string') {
        console.error('Invalid fileKey:', fileKey);
        return false;
    }

    console.log('Searching document in pn-SsDocumenti with documentKey:', fileKey);

    try {
        // Search for document by documentKey (Partition key)
        const command = new GetItemCommand({
            TableName: 'pn-SsDocumenti',
            Key: {
                documentKey: { S: fileKey }
            }
        });

        const result = await awsClient._dynamoClient.send(command);

        if (!result?.Item) {
            console.log('No match found in pn-SsDocumenti for documentKey:', fileKey);
            return false;
        }

        console.log('Raw DynamoDB Item:', JSON.stringify(result.Item, null, 2));

        const item = unmarshall(result.Item);
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
    } catch (error) {
        console.error('DynamoDB GetItem error:', error);
        return false;
    }
}

/**
 * Validates document timeline status
 * @param {AwsClientsWrapper} awsClient - Initialized AWS client
 * @param {string} fileKey - Document key to check
 * @returns {Promise<boolean>} True if timeline status is valid
 */
async function checkTimeline(awsClient, fileKey) {
    // Input validation
    if (!fileKey || typeof fileKey !== 'string') {
        console.error('Invalid fileKey:', fileKey);
        return false;
    }

    console.log('Searching DocumentCreationRequest with key:', fileKey);

    try {
        // Get document creation request by key
        const command = new GetItemCommand({
            TableName: 'pn-DocumentCreationRequestTable',
            Key: {
                key: { S: fileKey }
            }
        });

        const docRequest = await awsClient._dynamoClient.send(command);

        if (!docRequest?.Item) {
            console.log('No DocumentCreationRequest found for key:', fileKey);
            return false;
        }

        // Extract IUN and timeline ID with null checks
        const request = unmarshall(docRequest.Item);
        if (!request?.iun || !request?.timelineId) {
            console.log('Missing IUN or timelineId in request:', request);
            return false;
        }

        const { iun, timelineId } = request;
        console.log('Document details:', { iun, timelineId });

        // Get timeline entries and sort by timestamp
        const sortedTimeline = timelineId.Items
            .map(i => unmarshall(i))
            .sort((a, b) => b.timestamp - a.timestamp);

        // Safety check for timeline data
        if (!sortedTimeline.length) {
            console.log('No valid timeline entries after processing');
            return false;
        }

        console.log('Timeline analysis:', {
            latestTimestamp: new Date(sortedTimeline[0].timestamp).toISOString(),
            checkingTimestamp: new Date(sortedTimeline.find(t => t.timelineId === timelineId)?.timestamp)?.toISOString()
        });

        // Check if current timeline entry isn't the latest
        return sortedTimeline[0].timelineId !== timelineId;
    } catch (error) {
        console.error('Timeline check error:', error);
        return false;
    }
}

/**
 * Main execution function
 * Processes DLQ messages and performs validation checks
 */
async function main() {
    const args = validateArgs();
    const { envName } = args.values;

    const stats = {
        total: 0,
        passed: 0,
        s3Failed: 0,
        stateCheckFailed: 0,
        timelineFailed: 0
    };

    function printSummary(stats) {
        console.log('\n=== Execution Summary ===');
        console.log(`Total messages processed: ${stats.total}`);
        console.log(`Messages passed all checks: ${stats.passed}`);
        console.log(`Total messages failed: ${stats.total - stats.passed}`);
        console.log('\nFailures breakdown:');
        console.log(`- S3 bucket checks failed: ${stats.s3Failed}`);
        console.log(`- Document state checks failed: ${stats.stateCheckFailed}`);
        console.log(`- Timeline checks failed: ${stats.timelineFailed}`);
    }

    // Initialize CONFINFO clients once
    const confinfoAwsClient = new AwsClientsWrapper('confinfo', envName);
    const confinfoClients = await initializeAwsClients(confinfoAwsClient);

    // Initialize CORE clients once
    const coreAwsClient = new AwsClientsWrapper('core', envName);
    const coreClients = await initializeAwsClients(coreAwsClient);

    // CONFINFO profile
    const confinfoAccountId = await getAccountId(confinfoAwsClient);
    console.log(`Using CONFINFO Profile with AccountID: ${confinfoAccountId}`);

    // Dump and process DLQ messages
    const messages = await dumpSQSMessages(confinfoAwsClient);
    stats.total = messages.length;

    // Process each message separately
    for (const message of messages) {
        console.log('\n--- Processing new message ---');

        // Extract S3 object key
        const fileKey = message.Records?.[0]?.s3?.object?.key;
        if (!fileKey) {
            logResult(message, 'error', 'Missing fileKey in message');
            continue;
        }

        // Check S3 objects
        const s3Check = await checkS3Objects(confinfoAwsClient, fileKey, confinfoAccountId);
        if (!s3Check) {
            logResult(message, 'error', 'S3 check failed');
            stats.s3Failed++;
            continue;
        }

        // Check document state
        const docStateCheck = await checkDocumentState(confinfoAwsClient, fileKey);
        if (!docStateCheck) {
            logResult(message, 'error', 'Document state check failed');
            stats.stateCheckFailed++;
            continue;
        }

        // CORE profile
        const coreAccountId = await getAccountId(coreAwsClient);
        console.log(`Using CORE Profile with AccountID: ${coreAccountId}`);


        // Check document timeline
        const timelineCheck = await checkTimeline(coreAwsClient, fileKey);
        if (!timelineCheck) {
            logResult(message, 'error', 'Timeline check failed');
            stats.timelineFailed++;
            continue;
        }

        // All checks passed
        stats.passed++;
        logResult(message, 'ok');
    }

    printSummary(stats);
}

// Start execution with error handling
main().catch(console.error);