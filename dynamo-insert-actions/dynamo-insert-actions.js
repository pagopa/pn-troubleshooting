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
Usage: node update-actions-ttl.js --envName|-e <environment> --csvFile|-f <path> --ttlDays|-d <number> [--actionId|-a <id>]

Description:
    Updates TTL and notToHandle values for items in pn-Action DynamoDB table.

Parameters:
    --envName, -e     Required. Environment to update (dev|uat|test|prod|hotfix)
    --csvFile, -f     Required. Path to the CSV file containing actions data
    --ttlDays, -d     Required. Number of days to add to current TTL
    --actionId, -a    Optional. Start processing from this actionId
    --help, -h        Display this help message`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            csvFile: { type: "string", short: "f" },
            ttlDays: { type: "number", short: "d" },
            actionId: { type: "string", short: "a" },
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
        appendFileSync('results/failure.json', '', { flag: 'w' });
    } catch (error) {
        console.error('Error initializing results files:', error);
        process.exit(1);
    }
}

/**
 * Parses a CSV file containing action records
 * @param {string} filePath - Path to the CSV file
 * @param {string} [startFromActionId=null] - Optional actionId to start processing from
 * @returns {Array<Object>} Parsed CSV records
 * @throws {Error} If file reading or parsing fails
 */
function parseCsvFile(filePath, startFromActionId = null) {
    try {
        const fileContent = readFileSync(filePath, 'utf-8');
        let records = parse(fileContent, {
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

        if (startFromActionId) {
            const startIndex = records.findIndex(record => record.actionId === startFromActionId);
            if (startIndex === -1) {
                throw new Error(`ActionId ${startFromActionId} not found in CSV file`);
            }
            records = records.slice(startIndex);
            console.log(`Starting from actionId: ${startFromActionId} (${records.length} records)`);
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
function logResult(data) {
    appendFileSync('results/failure.json', JSON.stringify(data) + "\n");
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
    const { envName, csvFile, ttlDays, actionId } = args;

    initializeResultsFiles();

    const coreClient = new AwsClientsWrapper('core', envName);
    
    await testSsoCredentials(coreClient);
    
    coreClient._initDynamoDB();

    const records = parseCsvFile(csvFile, actionId);
    const itemsToInsert = prepareItemsForInsert(records, ttlDays);

    console.log(`Processing ${itemsToInsert.length} items to insert...`);
    
    let successCount = 0;
    let failureCount = 0;
    
    // Perform batch writes with strict error handling
    for (let i = 0; i < itemsToInsert.length; i += 25) {
        const batch = itemsToInsert.slice(i, i + 25);
        try {
            const result = await coreClient._batchWriteItem('pn-Action', batch);
            if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
                const unprocessedCount = Object.keys(result.UnprocessedItems).length;
                failureCount += unprocessedCount;
                successCount += (batch.length - unprocessedCount);
                console.error(`Failed to process ${unprocessedCount} items in batch`);
                process.exit(1);
            }
            successCount += batch.length;
            console.log(`Inserted items ${i + 1} to ${Math.min(i + 25, itemsToInsert.length)}`);
            
            // Log successful items to stdout
            batch.forEach(item => {
                console.log(JSON.stringify({
                    actionId: item.PutRequest.Item.actionId.S,
                    status: 'success'
                }));
            });
        } catch (error) {
            console.error('Error in batch write:', error);
            logResult({
                batchStart: i + 1,
                batchEnd: Math.min(i + 25, itemsToInsert.length),
                error: error.message
            });
            process.exit(1);
        }
    }

    // Print summary
    printSummary({
        totalProcessed: itemsToInsert.length,
        successCount,
        failureCount,
        unprocessedCount: 0
    });
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
