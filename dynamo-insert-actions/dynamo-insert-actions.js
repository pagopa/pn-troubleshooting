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
 * Initializes the results directory and files
 * @throws {Error} If directory creation fails
 */
function initializeResultsFiles() {
    try {
        if (!existsSync('results')) {
            mkdirSync('results');
        }
        // Create/empty result files
        appendFileSync('results/success.json', '', { flag: 'w' });
        appendFileSync('results/failure.json', '', { flag: 'w' });
    } catch (error) {
        console.error('Error initializing results files:', error);
        process.exit(1);
    }
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
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });

        // Validate required columns
        const requiredColumns = ['actionId', 'ttl'];
        const missingColumns = requiredColumns.filter(col => 
            !records[0] || typeof records[0][col] === 'undefined'
        );

        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        // Validate data types
        const invalidRecords = records.filter(record => 
            !record.actionId || 
            isNaN(parseInt(record.ttl))
        );

        if (invalidRecords.length > 0) {
            throw new Error(`Found ${invalidRecords.length} records with invalid data`);
        }

        return records;
    } catch (error) {
        console.error('Error reading/parsing CSV file:', error);
        process.exit(1);
    }
}

/**
 * Prepares DynamoDB insert items from CSV records
 * @param {Array<Object>} records - Parsed CSV records
 * @param {number} ttlDays - Number of days to add to TTL
 * @returns {Array<Object>} Formatted items for DynamoDB batch write
 */
function prepareItemsForInsert(records, ttlDays) {
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
 * Verifies DynamoDB inserts by querying inserted items
 * @param {AwsClientsWrapper} awsClient - AWS client wrapper instance
 * @param {Array<Object>} items - Items that were attempted to be inserted
 * @returns {Promise<{success: Array, failure: Array}>} Results of verification
 */
async function verifyInserts(awsClient, items) {
    const results = { success: [], failure: [] };
    
    console.log('Verifying inserts...');
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

    initializeResultsFiles();

    const coreClient = new AwsClientsWrapper('core', envName);
    
    await testSsoCredentials(coreClient);
    
    coreClient._initDynamoDB();

    const records = parseCsvFile(csvFile);
    const itemsToInsert = prepareItemsForInsert(records, ttlDays);

    console.log(`Processing ${itemsToInsert.length} items to insert...`);
    
    // Perform batch writes
    const unprocessedItems = [];
    for (let i = 0; i < itemsToInsert.length; i += 25) {
        const batch = itemsToInsert.slice(i, i + 25);
        const result = await coreClient._batchWriteItem('pn-Action', batch);
        if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
            unprocessedItems.push(...result.UnprocessedItems['pn-Action']);
        }
        console.log(`Inserted items ${i + 1} to ${Math.min(i + 25, itemsToInsert.length)}`);
    }

    // Verify inserts
    console.log('Verifying inserts...');
    const verificationResults = await verifyInserts(coreClient, 
        itemsToInsert.filter(item => !unprocessedItems.includes(item))
    );

    // Log results
    verificationResults.success.forEach(item => logResult('success', item));
    verificationResults.failure.forEach(item => logResult('failure', item));

    // Print summary
    printSummary({
        totalProcessed: itemsToInsert.length,
        successCount: verificationResults.success.length,
        failureCount: verificationResults.failure.length,
        unprocessedCount: unprocessedItems.length
    });
}

main().catch(console.error);
