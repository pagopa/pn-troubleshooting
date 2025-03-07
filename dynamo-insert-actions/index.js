import { parseArgs } from 'util';
import { parse } from 'csv-parse';
import { createReadStream, existsSync, mkdirSync, appendFileSync, createWriteStream } from 'fs';
import { AwsClientsWrapper } from "pn-common";
import { sleep } from "pn-common/libs/utils.js";
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { performance } from 'perf_hooks';
import { stringify } from 'csv-stringify';

/** Valid environment names for AWS operations */
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

let outputPath;

/**
 * Validates command line arguments and provides usage information
 * @returns {Object} Parsed and validated command line arguments
 * @throws {Error} If required arguments are missing or invalid
 */
function validateArgs() {
    const usage = `
Usage: node dynamo-insert-actions.js --csvFile|-f <path> --ttlDays|-d <number> [--envName|-e <environment>] [--actionId|-a <id>] [--dryRun|-r]

Description:
    Updates TTL and notToHandle values for items in pn-Action DynamoDB table.

Parameters:
    --csvFile, -f     Required. Path to the CSV file containing actions data
    --ttlDays, -d     Required. Number of days to add to current TTL
    --envName, -e     Optional. Environment to update (dev|uat|test|prod|hotfix)
    --actionId, -a    Optional. Start processing from this actionId
    --dryRun, -r      Optional. Simulate execution without writing to DynamoDB
    --help, -h        Display this help message`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            csvFile: { type: "string", short: "f" },
            ttlDays: { type: "string", short: "d" },
            actionId: { type: "string", short: "a" },
            dryRun: { type: "boolean", short: "r" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.csvFile || !args.values.ttlDays) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);
    }

    // Add ttlDays validation
    const ttlDays = parseInt(args.values.ttlDays);
    if (isNaN(ttlDays)) {
        console.error("Error: ttlDays must be a valid number");
        console.log(usage);
        process.exit(1);
    }
    args.values.ttlDays = ttlDays;

    if (args.values.envName && !VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }

    return args.values;
}

/**
 * Creates a timestamp-based folder name
 * @returns {string} Folder name in format YYYY-MM-DD_HH-mm-ss
 */
function getTimestampFolderName() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
}

/**
 * Initializes the results directory and files
 * @param {boolean} dryRun - If true, skip file creation
 * @param {string} envName - Optional environment name
 * @throws {Error} If directory creation fails
 */
function initializeResultsFiles(dryRun, envName) {
    if (dryRun) {
        return; // Skip file creation in dry run mode
    }
    
    try {
        // Create base results directory if it doesn't exist
        if (!existsSync('results')) {
            mkdirSync('results');
        }

        // Create timestamp directory
        const timestampDir = getTimestampFolderName();
        const timestampPath = `results/${timestampDir}`;
        if (!existsSync(timestampPath)) {
            mkdirSync(timestampPath);
        }

        // Set output path based on whether envName was provided
        outputPath = envName 
            ? `${timestampPath}/${envName}`
            : timestampPath;

        // Create environment directory if needed
        if (envName && !existsSync(outputPath)) {
            mkdirSync(outputPath);
        }

        // Initialize output files in the appropriate directory
        appendFileSync(`${outputPath}/failure.json`, '', { flag: 'w' });
        appendFileSync(`${outputPath}/failure.csv`, 'actionId,ttl\n', { flag: 'w' });
    } catch (error) {
        console.error('Error initializing results files:', error);
        process.exit(1);
    }
}

/**
 * Processes a batch of items with retries for unprocessed items
 * @param {Array} batch - Batch of items to process
 * @param {AwsClientsWrapper} AwsClient - AWS client wrapper
 * @param {boolean} dryRun - Flag to indicate dry run mode
 * @returns {Object} Processing results
 */
async function processBatchWithRetries(batch, AwsClient, dryRun) {
    if (dryRun) {
        return { success: batch.length, failed: 0, failedItems: [] };
    }

    let unprocessedItems = batch;
    let successCount = 0;
    let retryCount = 0;
    const maxRetries = 3;

    while (unprocessedItems.length > 0 && retryCount < maxRetries) {
        if (retryCount > 0) {
            await sleep(30); // Wait 30ms before retrying unprocessed items
        }

        const result = await AwsClient._batchWriteItem('pn-Action', unprocessedItems);
        await sleep(5); // Wait 5ms between batch writes

        unprocessedItems = result.UnprocessedItems?.['pn-Action'] || [];
        successCount += (unprocessedItems === batch ? 0 : batch.length - unprocessedItems.length);
        retryCount++;
    }

    return {
        success: successCount,
        failed: unprocessedItems.length,
        failedItems: unprocessedItems.map(item => ({
            actionId: item.PutRequest.Item.actionId.S,
            ttl: item.PutRequest.Item.ttl.N
        }))
    };
}

/**
 * Processes a CSV file using streams
 * @param {string} filePath - Path to the CSV file
 * @param {string} startFromActionId - Optional actionId to start processing from
 * @param {number} ttlDays - Number of days to add to TTL
 * @param {AwsClientsWrapper} AwsClient - AWS client wrapper
 * @param {boolean} dryRun - Flag to indicate dry run mode
 * @returns {Promise<Object>} Processing statistics
 */
async function processStreamedCsv(filePath, startFromActionId, ttlDays, AwsClient, dryRun = false) {
    let batch = [];
    let successCount = 0;
    let failureCount = 0;
    let lastFailedActionId = null;
    let foundStartId = !startFromActionId;
    
    const processor = new Transform({
        objectMode: true,
        transform: async function(record, encoding, callback) {
            if (!foundStartId) {
                foundStartId = record.actionId === startFromActionId;
                if (!foundStartId) {
                    return callback();
                }
            }

            if (!record.actionId) {
                console.error('Invalid record (missing actionId):', record);
                return callback();
            }

            const ttlValue = record.ttl && !isNaN(parseInt(record.ttl))
                ? parseInt(record.ttl)
                : Math.floor(Date.now() / 1000); // current timestamp in seconds

            batch.push({
                PutRequest: {
                    Item: {
                        actionId: { S: record.actionId },
                        ttl: { N: (ttlValue + (ttlDays * 86400)).toString() },
                        notToHandle: { BOOL: true }
                    }
                }
            });

            if (batch.length >= 25) {
                try {
                    const result = await processBatchWithRetries(batch, AwsClient, dryRun);
                    successCount += result.success;
                    failureCount += result.failed;

                    if (result.failed > 0) {
                        console.error(`Failed to process ${result.failed} items in batch after retries`);
                        logResult({
                            lastFailedActionId: result.failedItems[0].actionId,
                            error: 'Unprocessed items after retries',
                            failedItems: result.failedItems
                        }, dryRun);
                    }
                } catch (error) {
                    failureCount += batch.length;
                    console.error('Error in batch write:', error);
                    logResult({
                        lastFailedActionId: batch[0].PutRequest.Item.actionId.S,
                        error: error.message,
                        failedItems: batch.map(item => ({
                            actionId: item.PutRequest.Item.actionId.S,
                            ttl: item.PutRequest.Item.ttl.N
                        }))
                    }, dryRun);
                }
                batch = [];
                console.log(`${dryRun ? '[DRY RUN] ' : ''}Processed ${successCount} records so far...`);
            }
            callback();
        },
        flush: async function(callback) {
            if (batch.length > 0) {
                try {
                    const result = await processBatchWithRetries(batch, AwsClient, dryRun);
                    successCount += result.success;
                    failureCount += result.failed;
                } catch (error) {
                    failureCount += batch.length;
                    console.error('Error in final batch:', error);
                }
            }
            callback();
        }
    });

    try {
        await pipeline(
            createReadStream(filePath),
            parse({ columns: true, skip_empty_lines: true }),
            processor
        );
    } catch (error) {
        console.error('Pipeline failed:', error);
        throw error;
    }

    return { successCount, failureCount, lastFailedActionId };
}

/**
 * Logs operation results to JSON files
 * @param {Object} data - Data to be logged
 * @param {boolean} dryRun - If true, skip logging
 */
function logResult(data, dryRun) {
    if (!dryRun) {
        appendFileSync(`${outputPath}/failure.json`, JSON.stringify(data) + "\n");
        // Write to CSV file
        if (data.failedItems) {
            const csvWriter = createWriteStream(`${outputPath}/failure.csv`, { flags: 'a' });
            const stringifier = stringify({ header: false });
            data.failedItems.forEach(item => {
                stringifier.write([item.actionId, item.ttl]);
            });
            stringifier.pipe(csvWriter);
        }
    }
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
 * Prints a summary of the execution results including performance metrics
 * @param {Object} stats - Statistics object containing results
 * @param {number} stats.totalProcessed - Total number of items processed
 * @param {number} stats.successCount - Number of successful updates
 * @param {number} stats.failureCount - Number of failed updates
 * @param {number} stats.unprocessedCount - Number of unprocessed items
 * @param {string} stats.lastFailedActionId - Last actionId that failed to process
 * @param {number} stats.executionTime - Total execution time in milliseconds
 */
function printSummary(stats) {
    const usedMemory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    console.log('\n=== Execution Summary ===');
    if (stats.dryRun) {
        console.log('\n[DRY RUN MODE] No actual changes were made to DynamoDB');
    }
    console.log(`\nTotal items processed: ${stats.totalProcessed}`);
    console.log(`Successfully updated: ${stats.successCount}`);
    console.log(`Failed updates: ${stats.failureCount}`);
    if (stats.unprocessedCount > 0) {
        console.log(`Unprocessed items: ${stats.unprocessedCount}`);
    }
    if (stats.lastFailedActionId) {
        console.log(`\nTo resume from the last failed item, use:`);
        console.log(`--actionId "${stats.lastFailedActionId}"`);
    }

    console.log('\n=== Performance Metrics ===');
    console.log(`Execution time: ${(stats.executionTime / 1000).toFixed(2)} seconds`);
    console.log('\nMemory Usage:');
    console.log(`  - Heap Used: ${(usedMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - Heap Total: ${(usedMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - RSS: ${(usedMemory.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log('\nCPU Usage:');
    console.log(`  - User CPU time: ${(cpuUsage.user / 1000000).toFixed(2)} seconds`);
    console.log(`  - System CPU time: ${(cpuUsage.system / 1000000).toFixed(2)} seconds`);
}

/**
 * Main execution function
 * Processes CSV file and updates DynamoDB items with new TTL values
 * and sets notToHandle flag to true
 * @throws {Error} If AWS operations fail or file operations fail
 */
async function main() {
    const startTime = performance.now();
    const args = validateArgs();
    const { envName, csvFile, ttlDays, actionId, dryRun } = args;

    initializeResultsFiles(dryRun, envName);
    
    let AwsClient;
    if (envName) {
        AwsClient = new AwsClientsWrapper('core', envName);
    } else {
        AwsClient = new AwsClientsWrapper();
    }

    await testSsoCredentials(AwsClient);
    AwsClient._initDynamoDB();

    try {
        const stats = await processStreamedCsv(csvFile, actionId, ttlDays, AwsClient, dryRun);
        const executionTime = performance.now() - startTime;
        printSummary({
            totalProcessed: stats.successCount + stats.failureCount,
            ...stats,
            unprocessedCount: 0,
            dryRun,
            executionTime
        });
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
