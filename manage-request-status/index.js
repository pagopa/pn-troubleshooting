import { parseArgs } from 'util';
import { readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { stringify } from 'csv-stringify/sync';
import { writeFile } from 'fs/promises';
import { AwsClientsWrapper } from 'pn-common';

const VALID_COMMANDS = ['save_request_status'];
const RESULTS_DIR = './results';

function validateArgs() {
    const usage = `
Usage: node index.js <command> --inputFile|-i <path> [--envName|-e <environment>]

Commands:
    save_request_status    Query DynamoDB and save request status to CSV

Parameters:
    --inputFile, -i     Required. Path to the input TXT file
    --envName, -e       Optional. Target AWS environment
    --help, -h         Display this help message
    `;

    const args = parseArgs({
        options: {
            inputFile: { type: "string", short: "i" },
            envName: { type: "string", short: "e" },
            help: { type: "boolean", short: "h" }
        },
        allowPositionals: true,
        strict: true
    });

    if (args.values.help || args.positionals.length === 0) {
        console.log(usage);
        process.exit(0);
    }

    const command = args.positionals[0];
    if (!VALID_COMMANDS.includes(command)) {
        console.error(`Error: Invalid command. Must be one of: ${VALID_COMMANDS.join(', ')}`);
        process.exit(1);
    }

    if (!args.values.inputFile) {
        console.error("Error: Missing required parameter --inputFile");
        console.log(usage);
        process.exit(1);
    }

    return {
        command,
        inputFile: args.values.inputFile,
        envName: args.values.envName
    };
}

async function saveRequestStatus(inputFile, awsClient) {
    console.log('Reading request IDs from file...');
    const requestIds = readFileSync(inputFile, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    console.log(`Processing ${requestIds.length} request IDs...`);
    
    const results = [];
    for (const requestId of requestIds) {
        try {
            const response = await awsClient._queryRequest('pn-EcRichiesteMetadati', 'requestId', requestId);
            const status = response.Items?.[0]?.statusRequest?.S || 'NOT_FOUND';
            results.push([requestId, status]);
            console.log(`Processed ${requestId}: ${status}`);
        } catch (error) {
            console.error(`Error processing ${requestId}:`, error);
            results.push([requestId, 'ERROR']);
        }
    }

    // Ensure results directory exists
    mkdirSync(dirname(`${RESULTS_DIR}/saved.csv`), { recursive: true });

    // Write CSV file
    const csvContent = stringify(results, {
        header: true,
        columns: ['requestId', 'statusRequest']
    });

    await writeFile(`${RESULTS_DIR}/saved.csv`, csvContent);
    console.log(`\nResults saved to ${RESULTS_DIR}/saved.csv`);
}

async function main() {
    const args = validateArgs();
    
    // Initialize AWS client
    const awsClient = args.envName 
        ? new AwsClientsWrapper('confinfo', args.envName)
        : new AwsClientsWrapper();
    
    // Initialize DynamoDB client
    awsClient._initDynamoDB();

    switch (args.command) {
        case 'save_request_status':
            await saveRequestStatus(args.inputFile, awsClient);
            break;
        default:
            console.error('Invalid command');
            process.exit(1);
    }
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
