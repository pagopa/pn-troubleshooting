const { AwsClientsWrapper } = require('pn-common');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { parseArgs } = require('util');
const path = require('path');

const VALID_ENVIRONMENTS = ['dev', 'test', 'uat', 'hotfix', 'prod'];

function validateArgs() {
    const usage = `
Usage: node index.js --envName|-e <environment> --inputFile|-f <path>

Parameters:
    --envName, -e     Required. Environment to check (dev|test|uat|hotfix|prod)
    --inputFile, -f   Required. Path to the TXT file containing IUNs (one per line)
    --help, -h        Display this help message`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            inputFile: { type: "string", short: "f" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.envName || !args.values.inputFile) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);
    }

    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }

    if (!existsSync(args.values.inputFile)) {
        console.error(`Error: Input file not found: ${args.values.inputFile}`);
        process.exit(1);
    }

    return args;
}

function printSummary(stats, refinedPath, unrefinedPath) {
    console.log('\n=== Execution Summary ===');
    console.log(`\nTotal IUNs processed: ${stats.total}`);
    console.log(`Refined IUNs: ${stats.refined}`);
    console.log(`Unrefined IUNs: ${stats.unrefined}`);
    console.log('\nResults written to:');
    console.log(`- Refined IUNs: ${refinedPath}`);
    console.log(`- Unrefined IUNs: ${unrefinedPath}`);
}

async function queryTimeline(awsClient, iun) {
    const items = await awsClient._queryRequest(
        'pn-Timelines',
        'iun',
        iun
    );
    return items.Items.map(item => unmarshall(item));
}

function hasRelevantCategory(timelineItems) {
    const relevantCategories = ['REFINEMENT', 'NOTIFICATION_VIEWED'];
    return timelineItems.some(item => relevantCategories.includes(item.category));
}

async function disableFutureActions(awsClient, iun, isRefined) {
    if (isRefined) {
        const futureActions = await awsClient._queryRequestByIndex(
            'pn-FutureAction',
            'iun-index',
            'iun',
            iun
        );
        let updated = false;
        for (const action of futureActions.Items) {
            const item = unmarshall(action);
            if (item.actionId?.startsWith('check_attachment_retention_iun')) {
                await awsClient._dynamoClient.updateItem({
                    TableName: 'pn-FutureAction',
                    Key: {
                        actionId: { S: item.actionId },
                        timeSlot: { S: item.timeSlot }
                    },
                    UpdateExpression: 'SET logicalDeleted = :deleted',
                    ExpressionAttributeValues: {
                        ':deleted': { BOOL: true }
                    }
                });
                updated = true;
            }
        }
        return updated;
    }
    else {
        const futureActions = await awsClient._queryRequestByIndex(
            'pn-FutureAction',
            'iun-index',
            'iun',
            iun
        );
        let updated = false;
        for (const action of futureActions.Items) {
            const item = unmarshall(action);
            if (item.type === 'CHECK_ATTACHMENT_RETENTION') {
                try {
                    await awsClient._dynamoClient.updateItem({
                        TableName: 'pn-FutureAction',
                        Key: {
                            actionId: { S: item.actionId },
                            timeSlot: { S: item.timeSlot }
                        },
                        UpdateExpression: 'SET logicalDeleted = :deleted',
                        ConditionExpression: '#type = :typeVal',
                        ExpressionAttributeNames: {
                            '#type': 'type'
                        },
                        ExpressionAttributeValues: {
                            ':deleted': { BOOL: true },
                            ':typeVal': { S: 'CHECK_ATTACHMENT_RETENTION' }
                        }
                    });
                    updated = true;
                } catch (e) {
                    if (e.name === 'ConditionalCheckFailedException') {
                    } else {
                        throw e;
                    }
                }
            }
        }
        return updated;
    }
}

async function main() {
    try {
        const args = validateArgs();
        const stats = { total: 0, refined: 0, unrefined: 0 };
        const awsClient = new AwsClientsWrapper('core', args.values.envName);
        awsClient._initDynamoDB();

        const iuns = readFileSync(args.values.inputFile, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean);

        stats.total = iuns.length;
        console.log(`\nStarting processing of ${stats.total} IUNs...`);

        const timestamp = new Date().toISOString().replace(/:/g, '-').replace('.', '-');
        const resultsDir = path.join(__dirname, 'results');
        mkdirSync(resultsDir, { recursive: true });
        const refinedPath = path.join(resultsDir, `refined_iuns_${timestamp}.txt`);
        const unrefinedPath = path.join(resultsDir, `unrefined_iuns_${timestamp}.txt`);
        writeFileSync(refinedPath, '');
        writeFileSync(unrefinedPath, '');

        let progress = 0;
        for (const iun of iuns) {
            progress++;
            process.stdout.write(`\rProcessing IUN ${progress} of ${stats.total}`);
            const timelineItems = await queryTimeline(awsClient, iun);
            const isRefined = hasRelevantCategory(timelineItems);
            const updated = await disableFutureActions(awsClient, iun, isRefined);
            if (updated) {
                if (isRefined) {
                    writeFileSync(refinedPath, iun + '\n', { flag: 'a' });
                    stats.refined++;
                } else {
                    writeFileSync(unrefinedPath, iun + '\n', { flag: 'a' });
                    stats.unrefined++;
                }
            }
        }
        process.stdout.write('\n');
        printSummary(stats, refinedPath, unrefinedPath);
    } catch (error) {
        console.error('Error during execution:', error);
        process.exit(1);
    }
}

main().catch(console.error);