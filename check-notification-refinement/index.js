import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { AwsClientsWrapper } from "pn-common";
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import { parseArgs } from 'util';
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

function validateArgs() {
    const usage = `
Usage: node index.js --envName|-e <environment> --inputFile|-i <path>

Description:
        Verifies a list of IUNs to determine if the associated notifications have been refined.

Parameters:
        --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
        --inputFile, -i   Required. Path to the input file containing IUNs to check
        --help, -h        Display this help message

Example:
        node index.js --envName dev --inputFile ./IUNs.txt`;
   const args = parseArgs({
           options: {
                   envName: { type: "string", short: "e" },
                   inputFile: { type: "string", short: "i" },
                   help: { type: "boolean", short: "h" }
           },
           strict: true
   });

    if (args.values.help) {
            console.log(usage);
            process.exit(0);
    }

    if (!args.values.envName || !args.values.inputFile) {
            console.error("Error: Missing required parameters --envName and/or --inputFile");
            console.log(usage);
            process.exit(1);
    }
    
    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
            console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
            process.exit(1);
    }
    
    return args;
}

function parseIunsFromFile(inputFile) {
    const content = readFileSync(inputFile, 'utf-8');
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

async function initializeAwsClients(awsClient) {
    awsClient._initDynamoDB();
    return {
        dynamoDBClient: awsClient._dynamoClient
    };
}

function appendIunToFile(fileName, iun) {
    appendFileSync(fileName, iun + "\n");
}

function printSummary(stats, outputFiles) {
    console.log('\n=== Execution Summary ===');
    console.log(`Total IUNs processed: ${stats.total}`);
    console.log(`Unrefined: ${stats.unrefined}`);
    console.log(`Refined more than 120 days ago: ${stats.refined120plus}`);
    console.log(`Refined less than 120 days ago: ${stats.refined120minus}`);
    console.log(`Error: ${stats.error}`);
    console.log('\nResults written to:');
    console.log(`- Unrefined: ${outputFiles.unrefined}`);
    console.log(`- Refined more than 120 days ago: ${outputFiles.refined120plus}`);
    console.log(`- Refined less than 120 days ago: ${outputFiles.refined120minus}`);
    console.log(`- Error: ${outputFiles.error}`);
}

function daysBetween(date1, date2) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((date2 - date1) / msPerDay);
}

async function queryTimelineItems(dynamoDBClient, iun) {
    const command = new QueryCommand({
        TableName: 'pn-Timelines',
        KeyConditionExpression: 'iun = :iun',
        ExpressionAttributeValues: {
            ':iun': { S: iun }
        }
    });
    const result = await dynamoDBClient.send(command);
    return (result.Items || []).map(item => unmarshall(item));
}

function classifyTimeline(iun, items) {
    const matches = items.filter(
        item => item.category === 'NOTIFICATION_VIEWED' || item.category === 'REFINEMENT'
    );
    if (matches.length === 0) {
        return { category: 'Unrefined' };
    }
    if (matches.length === 1) {
        return { category: 'Refined', timestamp: matches[0].timestamp };
    }
    const sorted = matches.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return { category: 'Refined', timestamp: sorted[0].timestamp };
}

async function main() {
    const args = validateArgs();
    const { envName, inputFile } = args.values;

    if (!existsSync('results')) mkdirSync('results');

    const timestamp = new Date().toISOString().replace(/:/g, '-').replace('.', '-');
    const outputFiles = {
        unrefined: `results/unrefined_${timestamp}.txt`,
        refined120plus: `results/refined_120plus_${timestamp}.txt`,
        refined120minus: `results/refined_120minus_${timestamp}.txt`,
        error: `results/error_${timestamp}.txt`
    };

    const stats = {
        total: 0,
        unrefined: 0,
        refined120plus: 0,
        refined120minus: 0,
        error: 0
    };

    const iuns = parseIunsFromFile(inputFile);
    stats.total = iuns.length;

    const awsClient = new AwsClientsWrapper('core', envName);
    await initializeAwsClients(awsClient);

    let progress = 0;
    for (const iun of iuns) {
        progress++;
        process.stdout.write(`\rChecking IUN ${progress} of ${stats.total}`);
        let items;
        try {
            items = await queryTimelineItems(awsClient._dynamoClient, iun);
        } catch (err) {
            // If query fails, treat as error
            appendIunToFile(outputFiles.error, iun);
            stats.error++;
            continue;
        }
        const classification = classifyTimeline(iun, items);
        if (classification.category === 'Unrefined') {
            appendIunToFile(outputFiles.unrefined, iun);
            stats.unrefined++;
        } else {
            // Refined: check timestamp
            const refinedDate = new Date(classification.timestamp);
            const now = new Date();
            const days = daysBetween(refinedDate, now);
            if (days >= 120) {
                appendIunToFile(outputFiles.refined120plus, iun);
                stats.refined120plus++;
            } else {
                appendIunToFile(outputFiles.refined120minus, iun);
                stats.refined120minus++;
            }
        }
    }
    process.stdout.write('\n');
    printSummary(stats, outputFiles);
}

main().catch(console.error);

