import { parseArgs } from 'util';
import { parse } from 'csv-parse/sync';
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { AwsClientsWrapper } from "pn-common";

/** Valid environment names for AWS operations */
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

/**
 * Validates command line arguments and provides usage information
 * @returns {Object} Parsed and validated command line arguments
 * @throws {Error} If required arguments are missing or invalid
 */
function validateArgs() {
    const usage = `
Usage: node update-actions-ttl.js --envName|-e <environment> --csvFile|-f <path> --ttlDays|-d <number>

Description:
    Updates TTL and notToHandle values for items in pn-Action DynamoDB table.

Parameters:
    --envName, -e     Required. Environment to update (dev|uat|test|prod|hotfix)
    --csvFile, -f     Required. Path to the CSV file containing actions data
    --ttlDays, -d     Required. Number of days to add to current TTL
    --help, -h        Display this help message`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            csvFile: { type: "string", short: "f" },
            ttlDays: { type: "number", short: "d" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.envName || !args.values.csvFile || !args.values.ttlDays) {
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

/**
 * Parses a CSV file containing action records
 * @param {string} filePath - Path to the CSV file
 * @returns {Array<Object>} Parsed CSV records
 * @throws {Error} If file reading or parsing fails
 */
function parseCsvFile(filePath) {
    try {
        const fileContent = readFileSync(filePath, 'utf-8');
        return parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });
    } catch (error) {
        console.error('Error reading/parsing CSV file:', error);
        process.exit(1);
    }
}

/**
 * Prepares DynamoDB update items from CSV records
 * @param {Array<Object>} records - Parsed CSV records
 * @param {number} ttlDays - Number of days to add to TTL
 * @returns {Array<Object>} Formatted items for DynamoDB batch write
 */
function prepareUpdateItems(records, ttlDays) {
    return records.map(record => ({
        PutRequest: {
            Item: {
                actionId: { S: record.actionId },
                ttl: { N: (parseInt(record.ttl) + (ttlDays * 86400)).toString() },
                notToHandle: { BOOL: true }
            }
        }
    }));
}

/**
 * Logs operation results to JSON files
 * @param {'success'|'failure'} type - Type of result to log
 * @param {Object} data - Data to be logged
 */
function logResult(type, data) {
    const fileName = `results/${type}.json`;
    appendFileSync(fileName, JSON.stringify(data) + "\n");
}

/**
 * Simple progress counter for tracking operations
 */
class ProgressCounter {
    constructor(total, updateInterval = 10) {
        this.total = total;
        this.current = 0;
        this.updateInterval = updateInterval;
        this.lastUpdateTime = Date.now();
    }

    increment() {
        this.current++;
        const now = Date.now();
        if (this.current === this.total || now - this.lastUpdateTime >= 1000) {
            this.printProgress();
            this.lastUpdateTime = now;
        }
    }

    printProgress() {
        const percentage = ((this.current / this.total) * 100).toFixed(1);
        process.stdout.write(`\rProgress: ${this.current}/${this.total} (${percentage}%)`);
        if (this.current === this.total) {
            process.stdout.write('\n');
        }
    }
}

/**
 * Verifies DynamoDB updates by querying updated items
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper instance
 * @param {Array<Object>} items - Items that were attempted to be updated
 * @returns {Promise<{success: Array, failure: Array}>} Results of verification
 */
async function verifyUpdates(awsClient, items) {
    const results = { success: [], failure: [] };
    const progress = new ProgressCounter(items.length);
    
    console.log('Verifying updates...');
    for (const item of items) {
        const actionId = item.PutRequest.Item.actionId.S;
        const expectedTtl = item.PutRequest.Item.ttl.N;

        try {
            const response = await awsClient._queryRequest('pn-Action', 'actionId', actionId);
            
            if (response.Items && response.Items.length > 0) {
                const dbItem = response.Items[0];
                if (dbItem.ttl.N === expectedTtl && dbItem.notToHandle.BOOL === true) {
                    results.success.push({ actionId });
                } else {
                    results.failure.push({ actionId, ttl: expectedTtl });
                }
            } else {
                results.failure.push({ actionId, ttl: expectedTtl });
            }
        } catch (error) {
            console.error(`Error verifying item ${actionId}:`, error);
            results.failure.push({ actionId, ttl: expectedTtl });
        }
        progress.increment();
    }

    return results;
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
 * Prints a summary of the execution results
 * @param {Object} stats - Statistics object containing results
 * @param {number} stats.totalProcessed - Total number of items processed
 * @param {number} stats.successCount - Number of successful updates
 * @param {number} stats.failureCount - Number of failed updates
 * @param {number} stats.unprocessedCount - Number of unprocessed items
 */
function printSummary(stats) {
    console.log('\n=== Execution Summary ===');
    console.log(`\nTotal items processed: ${stats.totalProcessed}`);
    console.log(`Successfully updated: ${stats.successCount}`);
    console.log(`Failed updates: ${stats.failureCount}`);
    if (stats.unprocessedCount > 0) {
        console.log(`Unprocessed items: ${stats.unprocessedCount}`);
    }
    console.log('\nResults written to:');
    console.log('- results/success.json');
    console.log('- results/failure.json');
}

/**
 * Main execution function
 * Processes CSV file and updates DynamoDB items with new TTL values
 * and sets notToHandle flag to true
 * @throws {Error} If AWS operations fail or file operations fail
 */
async function main() {
    const args = validateArgs();
    const { envName, csvFile, ttlDays } = args;

    // Initialize AWS client
    const coreClient = new AwsClientsWrapper('core', envName);
    
    // Test SSO credentials before proceeding
    await testSsoCredentials(coreClient);
    
    coreClient._initDynamoDB();

    // Create results directory if it doesn't exist
    if (!existsSync('results')) {
        mkdirSync('results');
    }

    // Parse CSV and prepare items for update
    const records = parseCsvFile(csvFile);
    const updateItems = prepareUpdateItems(records, ttlDays);

    console.log(`Processing ${updateItems.length} items...`);
    const writeProgress = new ProgressCounter(updateItems.length);
    
    // Perform batch writes with progress tracking
    const unprocessedItems = [];
    for (let i = 0; i < updateItems.length; i += 25) {
        const batch = updateItems.slice(i, i + 25);
        const result = await coreClient._batchWriteItem('pn-Action', batch);
        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            unprocessedItems.push(...result.UnprocessedItems['pn-Action']);
        }
        batch.forEach(() => writeProgress.increment());
    }

    if (unprocessedItems.length > 0) {
        console.warn(`Warning: ${unprocessedItems.length} items were not processed`);
        unprocessedItems.forEach(item => {
            logResult('failure', {
                actionId: item.PutRequest.Item.actionId.S,
                ttl: item.PutRequest.Item.ttl.N
            });
        });
    }

    // Verify updates
    console.log('Verifying updates...');
    const verificationResults = await verifyUpdates(coreClient, 
        updateItems.filter(item => !unprocessedItems.includes(item))
    );

    // Log results
    verificationResults.success.forEach(item => logResult('success', item));
    verificationResults.failure.forEach(item => logResult('failure', item));

    // Print summary
    printSummary({
        totalProcessed: updateItems.length,
        successCount: verificationResults.success.length,
        failureCount: verificationResults.failure.length,
        unprocessedCount: unprocessedItems.length
    });
}

main().catch(console.error);
