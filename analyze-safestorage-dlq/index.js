// --- Required Dependencies ---
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';             // File system operations
import { AwsClientsWrapper } from "pn-common";                          // AWS services wrapper
import { unmarshall } from '@aws-sdk/util-dynamodb';                    // DynamoDB response parser
import { GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';              // DynamoDB GetItem command
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
Usage: node index.js --envName|-e <environment> --dumpFile|-f <path>

Description:
    Analyzes DLQ messages from SafeStorage events queue and validates related documents.

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

    // Show help and exit
    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    // Validate required parameters
    if (!args.values.envName || !args.values.dumpFile) {
        console.error("Error: Missing required parameters --envName and/or --dumpFile");
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
     * Prints a summary of the message processing statistics to the console.
     * 
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
    console.log(`\nTotal messages processed: ${stats.total}`);
    console.log(`Messages that passed: ${stats.passed}`);
    console.log(`Messages that failed: ${stats.total - stats.passed}`);
    console.log('\nFailures breakdown:');
    console.log(`- S3 bucket checks failed: ${stats.s3Failed}`);
    console.log(`- Document state checks failed: ${stats.stateCheckFailed}`);
    console.log(`- Timeline checks failed: ${stats.timelineFailed}`);
    console.log('\nResults written to:');
    console.log(`- Failed messages: results/need_further_analysis.json`);
    console.log(`- Passed messages: results/safe_to_delete.json`);
}

/**
 * Tests SSO credentials for a single AWS client
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper
 * @param {string} clientName - Name of the client for error reporting
 * @returns {Promise<void>}
 */
async function testSsoCredentials(awsClient, clientName) {
    try {
        awsClient._initSTS();
        await awsClient._getCallerIdentity();
    } catch (error) {
        if (error.name === 'CredentialsProviderError' ||
            error.message?.includes('expired') ||
            error.message?.includes('credentials')) {
            console.error(`\n=== SSO Authentication Error for ${clientName} client ===`);
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
 * Extracts MD5 fields from message
 * @param {Object} message - SQS message
 * @returns {Object} Object containing MD5 fields
 */
function extractMD5Fields(message) {
    const result = {
        MD5OfBody: message.MD5OfBody
    };
    
    if (message.MD5OfMessageAttributes) {
        result.MD5OfMessageAttributes = message.MD5OfMessageAttributes;
    }
    
    return result;
}

/**
 * Logs result to appropriate file and console
 * @param {Object} message - Message being processed
 * @param {string} status - Status of processing (error/ok)
 * @param {string} reason - Reason for failure
 */
function logResult(message, status, reason = '') {
    if (status === 'error') {
        // Deep clone message to avoid mutations
        const enrichedMessage = JSON.parse(JSON.stringify(message));
        
        // Parse Body if it's a string
        if (typeof enrichedMessage.Body === 'string') {
            enrichedMessage.Body = JSON.parse(enrichedMessage.Body);
        }
        
        // Add check results to Records array
        if (enrichedMessage.Body?.Records?.[0]) {
            enrichedMessage.Body.Records[0] = {
                ...enrichedMessage.Body.Records[0],
                dlqCheckTimestamp: new Date().toISOString(),
                dlqCheckStatus: status,
                dlqCheckResult: reason
            };
        }
        
        // Re-stringify Body before saving
        enrichedMessage.Body = JSON.stringify(enrichedMessage.Body);
        
        appendJsonToFile('results/need_further_analysis.json', enrichedMessage);
    } else {
        // For successes, output only MD5 fields
        const md5Data = extractMD5Fields(message);
        appendJsonToFile('results/safe_to_delete.json', md5Data);
    }
}

/**
 * Appends a JSON object as a new line to a file
 * @param {string} fileName - Target file path
 * @param {object} data - JSON data to append
 * Creates the directory structure if it doesn't exist
 */
function appendJsonToFile(fileName, data) {
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
 * Processes SQS dump file and extracts file keys for validation
 * @param {string} dumpFilePath - Path to SQS dump JSON file
 * @returns {Array} Array of messages with file keys
 */
function processSQSDump(dumpFilePath) {
    try {
        // Read and parse dump file
        const dumpContent = readFileSync(dumpFilePath, 'utf-8');
        const messages = JSON.parse(dumpContent);

        console.log(`Processing ${messages.length} messages from dump file`);

        // Extract file keys and relevant message data
        return messages.map(message => {
            try {
                const body = JSON.parse(message.Body);
                const fileKey = body?.Records?.[0]?.s3?.object?.key;

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
        }).filter(Boolean); // Remove null entries

    } catch (error) {
        console.error('Error reading/parsing dump file:', error);
        process.exit(1);
    }
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

    try {
        // Check if object exists in main bucket
        await awsClient._s3Client.send(new HeadObjectCommand({
            Bucket: mainBucket,
            Key: fileKey
        }));

        try {
            // Check if object exists in staging bucket (shouldn't)
            await awsClient._s3Client.send(new HeadObjectCommand({
                Bucket: stagingBucket,
                Key: fileKey
            }));
            return { success: false, reason: 'Object still exists in staging bucket' };
        } catch (e) {
            return { success: true };  // Success: Object doesn't exist in staging bucket
        }
    } catch (e) {
        return { success: false, reason: 'Object not found in main bucket' };
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

    try {
        // Search for document by documentKey (Partition key)
        const command = new GetItemCommand({
            TableName: 'pn-SsDocumenti',
            Key: {
                documentKey: { S: fileKey }
            }
        });

        const result = await awsClient._dynamoClient.send(command);

        // Check if document exists
        if (!result?.Item) {
            return false;
        }

        // Extract document type and expected state
        const item = unmarshall(result.Item);
        const documentType = item.documentType?.tipoDocumento;

        if (!documentType) {
            return false;
        }

        // Define document types and their expected states
        const ATTACHED_TYPES = [
            'PN_PRINTED',
            'PN_NOTIFICATION_ATTACHMENTS',
            'PN_F24_META'
        ];

        const SAVED_TYPES = [
            'PN_AAR',
            'PN_F24',
            'PN_F24_META',
            'PN_LEGAL_FACTS',
            'PN_EXTERNAL_LEGAL_FACTS',
            'PN_ADDRESSES_RAW',
            'PN_ADDRESSES_NORMALIZED',
            'PN_LOGS_ARCHIVE_AUDIT2Y',
            'PN_LOGS_ARCHIVE_AUDIT5Y',
            'PN_LOGS_ARCHIVE_AUDIT10Y'
        ];

        // Check if document state matches expected value
        let expectedState = null;
        if (ATTACHED_TYPES.includes(documentType)) {
            expectedState = 'ATTACHED';
        } else if (SAVED_TYPES.includes(documentType)) {
            expectedState = 'SAVED';
        }

        // Return detailed status
        return {
            success: item.documentLogicalState === expectedState,
            documentType,
            actualState: item.documentLogicalState,
            expectedState
        };
    } catch (error) {
        console.error('DynamoDB GetItem error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Validates document timeline status
 * @param {AwsClientsWrapper} awsClient - Initialized AWS client
 * @param {string} fileKey - Document key to check
 * @returns {Promise<boolean>} True if timeline status is valid
 */
async function checkTimeline(awsClient, fileKey) {
    if (!fileKey || typeof fileKey !== 'string') {
        console.error('Invalid fileKey:', fileKey);
        return false;
    }

    try {
        // Query document creation request
        const docRequest = await awsClient._queryRequest(
            'pn-DocumentCreationRequestTable',
            'key',
            `safestorage://${fileKey}`
        );

        if (!docRequest?.Items?.[0]) {
            return false;
        }

        // Extract IUN and timelineID
        const request = unmarshall(docRequest.Items[0]);
        if (!request?.iun || !request?.timelineId) {
            return false;
        }

        const { iun, timelineId } = request;

        // Get all timeline items for this IUN
        const allTimelineItems = await awsClient._queryRequest(
            'pn-Timelines',
            'iun',
            iun
        );

        // Sort by timestamp in descending order (newest first)
        const sortedItems = allTimelineItems.Items
            .map(item => unmarshall(item))

        sortedItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Find our specific timeline item in the sorted list
        const itemToCheck = sortedItems.find(item => item.timelineElementId === timelineId);

        if (!itemToCheck) {
            return false;
        }

        // Check if there are items with newer timestamps
        return itemToCheck.timestamp < sortedItems[0].timestamp;

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
    const { envName, dumpFile } = args.values;

    const stats = {
        total: 0,
        passed: 0,
        s3Failed: 0,
        stateCheckFailed: 0,
        timelineFailed: 0
    };

    // Initialize AWS clients
    const confinfoClient = new AwsClientsWrapper('confinfo', envName);
    const coreClient = new AwsClientsWrapper('core', envName);

    // Test SSO credentials for both clients before proceeding
    await Promise.all([
        testSsoCredentials(confinfoClient, 'confinfo'),
        testSsoCredentials(coreClient, 'core')
    ]);

    // Initialize AWS clients and create directories in parallel
    await Promise.all([
        initializeAwsClients(confinfoClient),
        initializeAwsClients(coreClient),
        new Promise(resolve => {
            if (!existsSync('results')) mkdirSync('results');
            resolve();
        })
    ]);

    // Get account IDs in parallel
    const [confinfoAccountId, coreAccountId] = await Promise.all([
        getAccountId(confinfoClient),
        getAccountId(coreClient)
    ]);

    console.log(`CONFINFO AccountID: ${confinfoAccountId}`);
    console.log(`CORE AccountID: ${coreAccountId}`);

    // Process dump file
    const messages = processSQSDump(dumpFile);
    stats.total = messages.length;

    console.log(`\nStarting validation checks for ${stats.total} messages...`);
    let progress = 0;

    // Process each message separately
    for (const message of messages) {

        // Track progress and display status 
        progress++;
        process.stdout.write(`\rChecking fileKey ${progress} of ${stats.total}`);

        // Extract S3 object key
        const fileKey = message.parsedFileKey;
        if (!fileKey) {
            logResult(message, 'error', 'Missing or invalid fileKey in message');
            continue;
        }

        // Check S3 objects
        const s3Check = await checkS3Objects(confinfoClient, fileKey, confinfoAccountId);
        if (!s3Check.success) {
            logResult(message, 'error', `S3 check failed: ${s3Check.reason}`);
            stats.s3Failed++;
            continue;
        }

        // Check document state
        const docStateCheck = await checkDocumentState(confinfoClient, fileKey);
        if (!docStateCheck.success) {
            const reason = docStateCheck.error || 
                          `Document state check failed: found '${docStateCheck.actualState}' but expected '${docStateCheck.expectedState}' for type '${docStateCheck.documentType}'`;
            logResult(message, 'error', reason);
            stats.stateCheckFailed++;
            continue;
        }

        // Only check timeline for PN_AAR and PN_LEGAL_FACTS
        if (['PN_AAR', 'PN_LEGAL_FACTS'].includes(docStateCheck.documentType)) {
            const timelineCheck = await checkTimeline(coreClient, fileKey);
            if (!timelineCheck) {
                logResult(message, 'error', 'Timeline check failed');
                stats.timelineFailed++;
                continue;
            }
        }

        stats.passed++;
        logResult(message, 'ok');

    }

    process.stdout.write('\n'); // Add newline after progress tracking
    printSummary(stats);
}

// Start execution with error handling
main().catch(console.error);