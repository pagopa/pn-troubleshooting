import { parseArgs } from 'util';
import { parse } from 'csv-parse';
import { createReadStream, existsSync, mkdirSync, appendFileSync } from 'fs';
import { AwsClientsWrapper } from "pn-common";
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { performance, PerformanceObserver } from 'perf_hooks';

/** Valid environment names for AWS operations */
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

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
 * Initializes the results directory and files
 * @param {boolean} dryRun - If true, skip file creation
 * @throws {Error} If directory creation fails
 */
function initializeResultsFiles(dryRun) {
    if (dryRun) {
        return; // Skip file creation in dry run mode
    }
    
    try {
        if (!existsSync('results')) {
            mkdirSync('results');
        }
        appendFileSync('results/failure.json', '', { flag: 'w' });
    } catch (error) {
        console.error('Error initializing results files:', error);
        process.exit(1);
    }
}

/**
 * Processes a CSV file using streams
 * @param {string} filePath - Path to the CSV file
 * @param {string} startFromActionId - Optional actionId to start processing from
 * @param {number} ttlDays - Number of days to add to TTL
 * @param {AwsClientsWrapper} coreClient - AWS client wrapper
 * @param {boolean} dryRun - Flag to indicate dry run mode
 * @returns {Promise<Object>} Processing statistics
 */
async function processStreamedCsv(filePath, startFromActionId, ttlDays, coreClient, dryRun = false) {
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

            if (!record.actionId || isNaN(parseInt(record.ttl))) {
                console.error('Invalid record:', record);
                return callback();
            }

            batch.push({
                PutRequest: {
                    Item: {
                        actionId: { S: record.actionId },
                        ttl: { N: (parseInt(record.ttl) + (ttlDays * 86400)).toString() },
                        notToHandle: { BOOL: true }
                    }
                }
            });

            if (batch.length >= 25) {
                try {
                    if (!dryRun) {
                        const result = await coreClient._batchWriteItem('pn-Action', batch);
                        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
                            const unprocessedCount = Object.keys(result.UnprocessedItems).length;
                            failureCount += unprocessedCount;
                            successCount += (batch.length - unprocessedCount);
                            lastFailedActionId = batch[0].PutRequest.Item.actionId.S;
                            console.error(`Failed to process ${unprocessedCount} items in batch`);
                            logResult({
                                lastFailedActionId,
                                error: 'Unprocessed items in batch'
                            }, dryRun);
                            process.exit(1);
                        }
                    }
                    successCount += batch.length;
                    console.log(`${dryRun ? '[DRY RUN] ' : ''}Processed ${successCount} records so far...`);
                    batch = [];
                } catch (error) {
                    lastFailedActionId = batch[0].PutRequest.Item.actionId.S;
                    console.error('Error in batch write:', error);
                    logResult({
                        lastFailedActionId,
                        error: error.message
                    }, dryRun);
                    process.exit(1);
                }
            }
            callback();
        },
        flush: async function(callback) {
            if (batch.length > 0) {
                try {
                    if (!dryRun) {
                        await coreClient._batchWriteItem('pn-Action', batch);
                    }
                    successCount += batch.length;
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
        appendFileSync('results/failure.json', JSON.stringify(data) + "\n");
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
    const { envName = 'dev', csvFile, ttlDays, actionId, dryRun } = args;  // Set default envName to 'dev'

    initializeResultsFiles(dryRun);
    const coreClient = new AwsClientsWrapper('core', envName);
    await testSsoCredentials(coreClient);
    coreClient._initDynamoDB();

    try {
        const stats = await processStreamedCsv(csvFile, actionId, ttlDays, coreClient, dryRun);
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
