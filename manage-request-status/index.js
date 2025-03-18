/**
 * @fileoverview A Node.js tool for managing request statuses in Amazon DynamoDB database
 * This script can:
 * 1. Save current request statuses to a CSV file
 * 2. Update request statuses in the database
 * 3. Restore request statuses from a previously saved CSV file
 * 
 * @requires util.parseArgs - Node.js utility for parsing command line arguments
 * @requires fs - Node.js file system module for reading/writing files
 * @requires readline - Node.js module for reading files line by line
 * @requires pn-common.AwsClientsWrapper - Custom AWS SDK wrapper
 * @requires stream/promises - Node.js streams with Promise support
 * @requires csv-stringify - NPM package for creating CSV files
 */

import { parseArgs } from 'util';
import { createReadStream, createWriteStream, mkdirSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { AwsClientsWrapper } from "pn-common";
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { stringify } from 'csv-stringify';

/**
 * List of valid environment names where this script can run
 * These environments represent different deployment stages of the application
 * @constant {string[]}
 */
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

/**
 * List of available commands that this script can execute
 * - save_request_status: Reads current status and saves to CSV
 * - set_request_status: Updates status in database
 * - restore_request_status: Restores status from CSV file
 * @constant {string[]}
 */
const VALID_COMMANDS = ['save_request_status', 'set_request_status', 'restore_request_status'];

/**
 * Validates and processes command line arguments passed to the script
 * This function ensures all required parameters are present and valid
 * 
 * @example
 * // Save current status to CSV
 * node index.js -i requests.txt -c save_request_status -e dev
 * 
 * // Update status to ACCEPTED
 * node index.js -i requests.txt -c set_request_status -s ACCEPTED -e dev
 * 
 * @returns {Object} An object containing validated arguments
 * @property {string} inputFile - Path to the input file (TXT or CSV)
 * @property {string} command - The command to execute
 * @property {string} [envName] - Target environment (optional)
 * @property {string} [status] - New status value (required for set_request_status)
 * @throws {Error} Exits process with status 1 if validation fails
 */
function validateArgs() {
    // Define the help text shown to users when they use --help or when validation fails
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

    /** 
     * Parse command line arguments using Node.js util.parseArgs
     * - inputFile: the file containing request IDs to process
     * - command: the operation to perform (save/set/restore)
     * - envName: which AWS environment to use
     * - status: new status value for updates
     * - help: show usage instructions
     */
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

    // Show usage instructions if --help flag is present
    if (args.values.help) {
        console.log(usage);
        process.exit(0);  // Exit successfully
    }

    // Verify required parameters are provided
    if (!args.values.inputFile || !args.values.command) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);  // Exit with error
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

    return args.values;  // Return validated arguments
}

/**
 * Reads input file and processes its contents based on the command type
 * For TXT files (save/set commands): reads requestIds line by line
 * For CSV files (restore command): reads requestId and statusRequest columns
 * 
 * @param {string} inputFile - Path to the input file to read
 * @param {string} command - Command that determines how to process the file
 * @returns {Promise<Array<{requestId: string, statusRequest?: string}>>} 
 *          Array of objects containing request IDs and optionally their status
 * @throws {Error} If file cannot be read or has invalid format
 */
async function readInputFile(inputFile, command) {
    /** Create a readable stream from the input file for efficient memory usage */
    const fileStream = createReadStream(inputFile);
    /** Array to store all records read from the file */
    const records = [];
    
    if (command === 'restore_request_status') {
        /** 
         * For restore operations, read CSV file with two columns:
         * - requestId: identifier of the request
         * - statusRequest: status to restore
         */
        const parser = parse({ 
            columns: true,  // Use first row as column names
            skip_empty_lines: true  // Skip empty lines in CSV
        });
        
        // Process each row in the CSV file
        for await (const record of fileStream.pipe(parser)) {
            if (record.requestId && record.statusRequest) {
                records.push({
                    requestId: record.requestId.trim(),
                    statusRequest: record.statusRequest.trim()
                });
            }
        }
    } else {
        /** 
         * For save/set operations, read simple text file with one requestId per line
         * Using readline interface for line-by-line processing
         */
        const rl = createInterface({
            input: fileStream,
            crlfDelay: Infinity  // Handle both \n and \r\n line endings
        });

        // Process each line in the text file
        for await (const line of rl) {
            if (line.trim()) {  // Skip empty lines
                records.push({ requestId: line.trim() });
            }
        }
    }

    return records;  // Return all processed records
}

/**
 * Processes a single request in the DynamoDB database
 * Can either read the current status or update it based on the command
 * 
 * @param {string} requestId - Unique identifier of the request to process
 * @param {AwsClientsWrapper} awsClient - AWS SDK wrapper instance for DynamoDB operations
 * @param {string} command - Command determining the operation to perform
 * @param {string} [newStatus] - New status to set (for set_request_status)
 * @param {string} [existingStatus] - Status from CSV file (for restore_request_status)
 * @returns {Promise<{requestId: string, statusRequest: string} | null>} 
 *          Object with request details or null if processing failed
 * @throws {Error} If DynamoDB operations fail
 */
async function processRequestId(requestId, awsClient, command, newStatus, existingStatus) {
    try {
        /** Query DynamoDB to get current request details */
        const result = await awsClient._queryRequest('pn-EcRichiesteMetadati', 'requestId', requestId);
        
        /** Check if request exists in database */
        if (!result.Items || result.Items.length === 0) {
            console.warn(`No items found for requestId: ${requestId}`);
            return null;
        }

        /** Get the first (and should be only) item from results */
        const item = result.Items[0];

        if (command === 'save_request_status') {
            /** For save operation, just return current status */
            return {
                requestId: requestId,
                statusRequest: item.statusRequest?.S || ''  // Get status or empty string if null
            };
        } else {
            /** For set/restore operations, update the status in DynamoDB */
            const statusToSet = command === 'restore_request_status' ? existingStatus : newStatus;
            const now = new Date().toISOString();  // Current timestamp for update

            /** Update item in DynamoDB with new status */
            await awsClient._updateItem(
                'pn-EcRichiesteMetadati',
                { requestId: { value: requestId } },  // Key to identify item
                {
                    statusRequest: { value: statusToSet },
                    lastUpdateTimestamp: { value: now }
                },
                'set'  // Operation type
            );

            console.log(`Updated status for ${requestId} to ${statusToSet}`);
            return {
                requestId: requestId,
                statusRequest: statusToSet
            };
        }
    } catch (error) {
        console.error(`Error processing ${requestId}:`, error);
        return null;  // Return null on error
    }
}

/**
 * Processes multiple requests from the input file
 * Reads the input file and processes each request in sequence
 * 
 * @param {string} inputFile - Path to file containing request IDs
 * @param {AwsClientsWrapper} awsClient - AWS SDK wrapper instance
 * @param {string} command - Command to execute for each request
 * @param {string} [newStatus] - New status value for set_request_status
 * @returns {Promise<Array>} Array of processed request results
 * @throws {Error} If file reading or request processing fails
 */
async function processInputFile(inputFile, awsClient, command, newStatus) {
    /** Array to store results of all processed requests */
    const results = [];

    /** Read and parse the input file */
    const records = await readInputFile(inputFile, command);

    /** Process each record from the input file */
    for (const record of records) {
        /** Process single request and get result */
        const result = await processRequestId(
            record.requestId, 
            awsClient, 
            command, 
            newStatus,           // New status for set operations
            record.statusRequest // Existing status for restore operations
        );

        /** Add successful results to output array */
        if (result) {
            results.push(result);
        }
    }

    return results;  // Return all processed results
}

/**
 * Saves processing results to a CSV file
 * Creates a 'results' directory if it doesn't exist
 * Generates a CSV file with requestId and statusRequest columns
 * 
 * @param {Array<{requestId: string, statusRequest: string}>} results - Array of processed requests
 * @returns {Promise<void>}
 * @throws {Error} If directory creation or file writing fails
 */
async function saveResults(results) {
    /** Create results directory if it doesn't exist */
    if (!existsSync('results')) {
        mkdirSync('results');
    }

    /** Create a write stream for the output CSV file */
    const writeable = createWriteStream('results/saved.csv');

    /** Configure CSV stringifier with headers */
    const stringifier = stringify({ 
        header: true,  // Include header row
        columns: ['requestId', 'statusRequest']  // Column names
    });
    
    /** 
     * Pipeline to write results:
     * 1. Transform results array to stream
     * 2. Convert to CSV format
     * 3. Write to file
     */
    await pipeline(
        Transform.from(results),
        stringifier,
        writeable
    );

    console.log('Results saved to results/saved.csv');
}

/**
 * Main function that coordinates the entire process
 * 1. Validates command line arguments
 * 2. Initializes AWS client
 * 3. Processes requests
 * 4. Saves results
 * 
 * This is the entry point of the script that ties all operations together
 * 
 * @returns {Promise<void>}
 * @throws {Error} If any operation in the process fails
 */
async function main() {
    /** Get and validate command line arguments */
    const args = validateArgs();
    const { inputFile, command, envName, status } = args;

    /** 
     * Initialize AWS client
     * If envName is provided, configure for specific environment
     * Otherwise use default configuration
     */
    const awsClient = envName 
        ? new AwsClientsWrapper('confinfo', envName)
        : new AwsClientsWrapper();
    
    /** Initialize DynamoDB client */
    awsClient._initDynamoDB();

    try {
        /** Process all requests from input file */
        const results = await processInputFile(inputFile, awsClient, command, status);
        /** Save results to CSV file */
        await saveResults(results);
    } catch (error) {
        console.error('Error during execution:', error);
        process.exit(1);  // Exit with error
    }
}

// Start execution with error handling
main().catch(error => {
    console.error('Fatal error during execution:', error);
    process.exit(1);
});
