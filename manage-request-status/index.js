import { parseArgs } from 'util';
import { createReadStream, createWriteStream, mkdirSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { AwsClientsWrapper } from "pn-common";
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { stringify } from 'csv-stringify';

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];
const VALID_COMMANDS = ['save_request_status', 'set_request_status', 'restore_request_status'];

function validateArgs() {
    const usage = `
Usage: node index.js --inputFile|-i <path> --command|-c <command> [--envName|-e <environment>] [--status|-s <status>]

Description:
    Query and optionally update request status in DynamoDB.

Commands:
    save_request_status     Save current status to CSV
    set_request_status      Update status in DynamoDB (requires --status)
    restore_request_status  Update status in DynamoDB using values from CSV input

Parameters:
    --inputFile, -i    Required. Path to input file (TXT for save/set, CSV for restore)
    --command, -c      Required. Command to execute
    --envName, -e      Optional. Environment name (dev|uat|test|prod|hotfix)
    --status, -s       Required for set_request_status. New status value
    --help, -h        Display this help message`;

    const args = parseArgs({
        options: {
            inputFile: { type: "string", short: "i" },
            command: { type: "string", short: "c" },
            envName: { type: "string", short: "e" },
            status: { type: "string", short: "s" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.inputFile || !args.values.command) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);
    }

    if (!VALID_COMMANDS.includes(args.values.command)) {
        console.error(`Error: Invalid command. Must be one of: ${VALID_COMMANDS.join(', ')}`);
        process.exit(1);
    }

    if (args.values.command === 'set_request_status' && !args.values.status) {
        console.error("Error: --status is required for set_request_status command");
        process.exit(1);
    }

    if (args.values.command === 'restore_request_status' && !args.values.inputFile.toLowerCase().endsWith('.csv')) {
        console.error("Error: restore_request_status requires a CSV input file");
        process.exit(1);
    }

    if (args.values.envName && !VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }

    return args.values;
}

/**
 * Reads and processes records from input file based on command type
 * @param {string} inputFile - Path to the input file
 * @param {string} command - Command to execute
 * @returns {Promise<Array<{requestId: string, statusRequest?: string}>>}
 */
async function readInputFile(inputFile, command) {
    const fileStream = createReadStream(inputFile);
    const records = [];
    
    if (command === 'restore_request_status') {
        // Read CSV file with requestId and statusRequest columns
        const parser = parse({ 
            columns: true,
            skip_empty_lines: true
        });
        
        for await (const record of fileStream.pipe(parser)) {
            if (record.requestId && record.statusRequest) {
                records.push({
                    requestId: record.requestId.trim(),
                    statusRequest: record.statusRequest.trim()
                });
            }
        }
    } else {
        // Read TXT file with requestIds only
        const rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (line.trim()) {
                records.push({ requestId: line.trim() });
            }
        }
    }

    return records;
}

/**
 * Processes a single request ID in DynamoDB
 * @param {string} requestId - Request ID to process
 * @param {AwsClientsWrapper} awsClient - AWS client instance
 * @param {string} command - Command to execute
 * @param {string} newStatus - New status to set (for set_request_status)
 * @param {string} existingStatus - Existing status (for restore_request_status)
 * @returns {Promise<{requestId: string, statusRequest: string} | null>}
 */
async function processRequestId(requestId, awsClient, command, newStatus, existingStatus) {
    try {
        const result = await awsClient._queryRequest('pn-EcRichiesteMetadati', 'requestId', requestId);
        
        if (!result.Items || result.Items.length === 0) {
            console.warn(`No items found for requestId: ${requestId}`);
            return null;
        }

        const item = result.Items[0];

        if (command === 'save_request_status') {
            return {
                requestId: requestId,
                statusRequest: item.statusRequest?.S || ''
            };
        } else {
            const statusToSet = command === 'restore_request_status' ? existingStatus : newStatus;
            const now = new Date().toISOString();
            await awsClient._updateItem(
                'pn-EcRichiesteMetadati',
                { requestId: { value: requestId } },
                {
                    statusRequest: { value: statusToSet },
                    lastUpdateTimestamp: { value: now }
                },
                'set'
            );
            console.log(`Updated status for ${requestId} to ${statusToSet}`);
            return {
                requestId: requestId,
                statusRequest: statusToSet
            };
        }
    } catch (error) {
        console.error(`Error processing ${requestId}:`, error);
        return null;
    }
}

/**
 * Process all request IDs from the input file
 * @param {string} inputFile - Path to the input file
 * @param {AwsClientsWrapper} awsClient - AWS client instance
 * @param {string} command - Command to execute
 * @param {string} newStatus - New status to set (for set_request_status)
 * @returns {Promise<Array<{requestId: string, statusRequest: string}>>}
 */
async function processInputFile(inputFile, awsClient, command, newStatus) {
    const results = [];
    const records = await readInputFile(inputFile, command);

    for (const record of records) {
        const result = await processRequestId(
            record.requestId, 
            awsClient, 
            command, 
            newStatus, 
            record.statusRequest
        );
        if (result) {
            results.push(result);
        }
    }

    return results;
}

/**
 * Saves results to a CSV file in the results directory
 * @param {Array<{requestId: string, statusRequest: string}>} results - Results to save
 * @returns {Promise<void>}
 */
async function saveResults(results) {
    if (!existsSync('results')) {
        mkdirSync('results');
    }

    const writeable = createWriteStream('results/saved.csv');
    const stringifier = stringify({ 
        header: true, 
        columns: ['requestId', 'statusRequest']
    });
    
    await pipeline(
        Transform.from(results),
        stringifier,
        writeable
    );

    console.log('Results saved to results/saved.csv');
}

/**
 * Main function that orchestrates the request status management process
 * @returns {Promise<void>}
 */
async function main() {
    // Parse and validate command line arguments
    const args = validateArgs();
    const { inputFile, command, envName, status } = args;

    // Initialize AWS client with optional environment
    const awsClient = envName 
        ? new AwsClientsWrapper('confinfo', envName)
        : new AwsClientsWrapper();
    
    awsClient._initDynamoDB();

    try {
        // Process requests and save results
        const results = await processInputFile(inputFile, awsClient, command, status);
        await saveResults(results);
    } catch (error) {
        console.error('Error during execution:', error);
        process.exit(1);
    }
}

// Start execution
main().catch(error => {
    console.error('Fatal error during execution:', error);
    process.exit(1);
});
