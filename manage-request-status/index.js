import { parseArgs } from 'util';
import { readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { stringify } from 'csv-stringify/sync';
import { writeFile } from 'fs/promises';
import { AwsClientsWrapper } from 'pn-common';
import { parse } from 'csv-parse/sync';

const VALID_COMMANDS = ['save_request_status', 'set_request_status', 'restore_request_status'];
const RESULTS_DIR = './results';

function validateArgs() {
    const usage = `
Usage: node index.js <command> --inputFile|-i <path> [--envName|-e <environment>] [--status|-s <status>]

Commands:
    save_request_status     Query DynamoDB and save request status to CSV
    set_request_status      Update request status and timestamp in DynamoDB
    restore_request_status  Restore request status from CSV backup

Parameters:
    --inputFile, -i     Required. Path to the input file (TXT for save/set, CSV for restore)
    --envName, -e       Optional. Target AWS environment
    --status, -s        Required for set_request_status. New status to set
    --help, -h         Display this help message`;

    const args = parseArgs({
        options: {
            inputFile: { type: "string", short: "i" },
            envName: { type: "string", short: "e" },
            status: { type: "string", short: "s" },
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

    if (command === 'set_request_status' && !args.values.status) {
        console.error("Error: --status parameter is required for set_request_status command");
        console.log(usage);
        process.exit(1);
    }

    return {
        command,
        inputFile: args.values.inputFile,
        envName: args.values.envName,
        status: args.values.status
    };
}

async function saveRequestStatus(inputFile, awsClient) {
    console.log('Reading request IDs from file...');
    const requestIds = readFileSync(inputFile, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.startsWith('pn-cons-000~') ? line : `pn-cons-000~${line}`);

    console.log(`Processing ${requestIds.length} request IDs...`);
    
    const results = [];
    let processed = 0;
    for (const requestId of requestIds) {
        try {
            const fullRequestId = requestId.startsWith('pn-cons-000~') ? requestId : `pn-cons-000~${requestId}`;
            const response = await awsClient._queryRequest('pn-EcRichiesteMetadati', 'requestId', fullRequestId);
            const status = response.Items?.[0]?.statusRequest?.S || 'NOT_FOUND';
            results.push([requestId, status]);
            process.stdout.write(`\rProcessed ${++processed}/${requestIds.length} items`);
        } catch (error) {
            results.push([requestId, 'ERROR']);
            process.stdout.write(`\rProcessed ${++processed}/${requestIds.length} items`);
        }
    }
    console.log();

    mkdirSync(dirname(`${RESULTS_DIR}/saved.csv`), { recursive: true });
    const csvContent = stringify(results, {
        header: true,
        columns: ['requestId', 'statusRequest']
    });

    await writeFile(`${RESULTS_DIR}/saved.csv`, csvContent);
    console.log(`\nResults saved to ${RESULTS_DIR}/saved.csv`);
}

async function setRequestStatus(inputFile, awsClient, newStatus) {
    console.log('Reading request IDs from file...');
    const requestIds = readFileSync(inputFile, 'utf-8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => line.startsWith('pn-cons-000~') ? line : `pn-cons-000~${line}`);

    console.log(`Processing ${requestIds.length} request IDs...`);
    
    const stats = {
        total: requestIds.length,
        updated: 0,
        failed: 0
    };
    
    const failedRequests = [];
    let processed = 0;
    
    for (const requestId of requestIds) {
        try {
            const fullRequestId = requestId.startsWith('pn-cons-000~') ? requestId : `pn-cons-000~${requestId}`;
            const currentItem = await awsClient._queryRequest('pn-EcRichiesteMetadati', 'requestId', fullRequestId);
            if (!currentItem.Items?.[0]) {
                throw new Error('Item not found');
            }
            const currentVersion = parseInt(currentItem.Items[0].version?.N || '0', 10);
            const timestamp = new Date().toISOString();
            await awsClient._updateItem(
                'pn-EcRichiesteMetadati',
                { requestId: fullRequestId },
                {
                    lastUpdateTimestamp: {
                        codeAttr: '#lut',
                        codeValue: ':lut',
                        value: timestamp
                    },
                    statusRequest: {
                        codeAttr: '#sr',
                        codeValue: ':sr',
                        value: newStatus
                    },
                    version: {
                        codeAttr: '#v',
                        codeValue: ':v',
                        value: currentVersion + 1
                    }
                },
                'SET'
            );
            stats.updated++;
        } catch (error) {
            stats.failed++;
            failedRequests.push(requestId);
        }
        process.stdout.write(`\rProcessed ${++processed}/${requestIds.length} items`);
    }
    console.log();

    if (failedRequests.length > 0) {
        await writeFile(`${RESULTS_DIR}/failed.txt`, failedRequests.join('\n'));
        console.log(`\nFailed request IDs have been saved to ${RESULTS_DIR}/failed.txt`);
    }

    console.log('\n=== Update Summary ===');
    console.log(`Total items processed: ${stats.total}`);
    console.log(`Items updated: ${stats.updated}`);
    console.log(`Failed updates: ${stats.failed}`);
}

async function restoreRequestStatus(inputFile, awsClient) {
    console.log('Reading backup data from CSV...');
    const fileContent = readFileSync(inputFile, 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
    });

    if (!records.length || !('requestId' in records[0]) || !('statusRequest' in records[0])) {
        console.error('Error: CSV must have "requestId" and "statusRequest" columns');
        process.exit(1);
    }

    console.log(`Processing ${records.length} records...`);
    
    const stats = {
        total: records.length,
        updated: 0,
        failed: 0
    };

    const failedRequests = [];
    let processed = 0;

    for (const record of records) {
        try {
            const fullRequestId = record.requestId.startsWith('pn-cons-000~') ? record.requestId : `pn-cons-000~${record.requestId}`;
            const currentItem = await awsClient._queryRequest('pn-EcRichiesteMetadati', 'requestId', fullRequestId);
            if (!currentItem.Items?.[0]) {
                throw new Error('Item not found');
            }
            const currentVersion = parseInt(currentItem.Items[0].version?.N || '0', 10);
            
            const timestamp = new Date().toISOString();
            await awsClient._updateItem(
                'pn-EcRichiesteMetadati',
                { requestId: fullRequestId },
                {
                    lastUpdateTimestamp: {
                        codeAttr: '#lut',
                        codeValue: ':lut',
                        value: timestamp
                    },
                    statusRequest: {
                        codeAttr: '#sr',
                        codeValue: ':sr',
                        value: record.statusRequest
                    },
                    version: {
                        codeAttr: '#v',
                        codeValue: ':v',
                        value: currentVersion + 1
                    }
                },
                'SET'
            );
            stats.updated++;
        } catch (error) {
            stats.failed++;
            failedRequests.push(record.requestId);
        }
        process.stdout.write(`\rProcessed ${++processed}/${records.length} items`);
    }
    console.log();

    if (failedRequests.length > 0) {
        await writeFile(`${RESULTS_DIR}/failed.txt`, failedRequests.join('\n'));
        console.log(`\nFailed request IDs have been saved to ${RESULTS_DIR}/failed.txt`);
    }

    console.log('\n=== Update Summary ===');
    console.log(`Total items processed: ${stats.total}`);
    console.log(`Items updated: ${stats.updated}`);
    console.log(`Failed updates: ${stats.failed}`);
}

async function main() {
    const args = validateArgs();
    
    const awsClient = args.envName 
        ? new AwsClientsWrapper('confinfo', args.envName)
        : new AwsClientsWrapper();
    
    awsClient._initDynamoDB();

    switch (args.command) {
        case 'save_request_status':
            await saveRequestStatus(args.inputFile, awsClient);
            break;
        case 'set_request_status':
            await setRequestStatus(args.inputFile, awsClient, args.status);
            break;
        case 'restore_request_status':
            await restoreRequestStatus(args.inputFile, awsClient);
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
