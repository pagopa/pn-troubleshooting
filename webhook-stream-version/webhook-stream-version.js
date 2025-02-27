import { parseArgs } from 'util';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { AwsClientsWrapper } from "pn-common";

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node webhook-stream-version.js --envName|-e <environment> --csvFile|-f <path>

Description:
    Updates DynamoDB items in pn-WebhookStreams table with version information.

Parameters:
    --envName, -e     Required. Environment to update (dev|uat|test|prod|hotfix)
    --csvFile, -f     Required. Path to the CSV file containing stream data
    --help, -h        Display this help message`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            csvFile: { type: "string", short: "f" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.envName || !args.values.csvFile) {
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
 * Parses input CSV file
 * @param {string} filePath - Path to CSV file
 * @returns {Array<Object>} Parsed records
 */
function parseCsvFile(filePath) {
    try {
        const fileContent = readFileSync(filePath, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });

        // Validate required columns
        const requiredColumns = ['hashKey', 'sortKey', 'version'];
        const missingColumns = requiredColumns.filter(col => 
            !records[0] || typeof records[0][col] === 'undefined'
        );

        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        return records;
    } catch (error) {
        console.error('Error reading/parsing CSV file:', error);
        process.exit(1);
    }
}

/**
 * Prints execution summary
 * @param {Object} stats - Execution statistics
 */
function printSummary(stats) {
    console.log('\n=== Execution Summary ===');
    console.log(`\nTotal items processed: ${stats.total}`);
    console.log(`Items updated: ${stats.updated}`);
    console.log(`Items skipped (version already exists): ${stats.skipped}`);
    console.log(`Failed updates: ${stats.failed}`);
}

/**
 * Main execution function
 */
async function main() {
    const args = validateArgs();
    const { envName, csvFile } = args;

    // Initialize AWS client
    const coreClient = new AwsClientsWrapper('core', envName);
    await testSsoCredentials(coreClient);
    coreClient._initDynamoDB();

    // Parse CSV file
    const records = parseCsvFile(csvFile);
    console.log(`Processing ${records.length} records...`);

    const stats = {
        total: records.length,
        updated: 0,
        skipped: 0,
        failed: 0
    };

    // Process each record
    for (const record of records) {
        try {
            await coreClient._updateItem(
                'pn-WebhookStreams',
                {
                    hashKey: record.hashKey,
                    sortKey: record.sortKey
                },
                {
                    version: {
                        codeAttr: '#v',
                        codeValue: ':v',
                        value: record.version
                    }
                },
                'SET',
                'attribute_not_exists(version)'
            );

            console.log(`Updated ${record.hashKey}/${record.sortKey} with version ${record.version}`);
            stats.updated++;
        } catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                console.log(`Skipping ${record.hashKey}/${record.sortKey} - version already exists`);
                stats.skipped++;
            } else {
                console.error(`Error processing ${record.hashKey}/${record.sortKey}:`, error);
                stats.failed++;
            }
        }
    }

    // Print summary
    printSummary(stats);
}

// Start execution with error handling
main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});