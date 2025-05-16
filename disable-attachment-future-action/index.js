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

function printSummary(stats, paths) {
    console.log('\n=== Execution Summary ===');
    console.log(`\nTotal IUNs processed: ${stats.total}`);
    console.log(`  - Future actions disabled: ${stats.total_disabled}`);
    console.log(`  - Future actions NOT disabled: ${stats.total_not_disabled}`);
    console.log(`\nRefined IUNs: ${stats.refined}`);
    console.log(`  - Future actions disabled: ${stats.refined_disabled}`);
    console.log(`  - Future actions NOT disabled: ${stats.refined_not_disabled}`);
    console.log(`\nUnrefined IUNs: ${stats.unrefined}`);
    console.log(`  - Future actions disabled: ${stats.unrefined_disabled}`);
    console.log(`  - Future actions NOT disabled: ${stats.unrefined_not_disabled}`);
    console.log('\nResults written to:');
    console.log(`- Refined IUNs (future actions disabled): ${paths.refinedDisabledPath}`);
    console.log(`- Refined IUNs (future actions NOT disabled): ${paths.refinedNotDisabledPath}`);
    console.log(`- Unrefined IUNs (future actions disabled): ${paths.unrefinedDisabledPath}`);
    console.log(`- Unrefined IUNs (future actions NOT disabled): ${paths.unrefinedNotDisabledPath}`);
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
                await awsClient._updateItem(
                    'pn-FutureAction',
                    { actionId: item.actionId, timeSlot: item.timeSlot },
                    { logicalDeleted: { codeAttr: '#logicalDeleted', codeValue: ':deleted', value: true } },
                    'SET'
                );
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
                    await awsClient._updateItem(
                        'pn-FutureAction',
                        { actionId: item.actionId, timeSlot: item.timeSlot },
                        { 
                            logicalDeleted: { codeAttr: '#logicalDeleted', codeValue: ':deleted', value: true },
                            type: { codeAttr: '#type', codeValue: ':typeVal', value: 'CHECK_ATTACHMENT_RETENTION' }
                        },
                        'SET',
                        '#type = :typeVal'
                    );
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
        const stats = {
            total: 0,
            refined: 0,
            unrefined: 0,
            total_disabled: 0,
            total_not_disabled: 0,
            refined_disabled: 0,
            refined_not_disabled: 0,
            unrefined_disabled: 0,
            unrefined_not_disabled: 0
        };
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

        const refinedDisabledPath = path.join(resultsDir, `refined_iuns_disabled_${timestamp}.txt`);
        const refinedNotDisabledPath = path.join(resultsDir, `refined_iuns_not_disabled_${timestamp}.txt`);
        const unrefinedDisabledPath = path.join(resultsDir, `unrefined_iuns_disabled_${timestamp}.txt`);
        const unrefinedNotDisabledPath = path.join(resultsDir, `unrefined_iuns_not_disabled_${timestamp}.txt`);
        writeFileSync(refinedDisabledPath, '');
        writeFileSync(refinedNotDisabledPath, '');
        writeFileSync(unrefinedDisabledPath, '');
        writeFileSync(unrefinedNotDisabledPath, '');

        let progress = 0;
        for (const iun of iuns) {
            progress++;
            process.stdout.write(`\rProcessing IUN ${progress} of ${stats.total}`);
            const timelineItems = await queryTimeline(awsClient, iun);
            const isRefined = hasRelevantCategory(timelineItems);
            let disabled = false;
            try {
                disabled = await disableFutureActions(awsClient, iun, isRefined);
            } catch (e) {
                console.error(`\nError disabling future actions for IUN ${iun}:`, e);
            }
            if (isRefined) {
                stats.refined++;
                if (disabled) {
                    writeFileSync(refinedDisabledPath, iun + '\n', { flag: 'a' });
                    stats.refined_disabled++;
                    stats.total_disabled++;
                } else {
                    writeFileSync(refinedNotDisabledPath, iun + '\n', { flag: 'a' });
                    stats.refined_not_disabled++;
                    stats.total_not_disabled++;
                }
            } else {
                stats.unrefined++;
                if (disabled) {
                    writeFileSync(unrefinedDisabledPath, iun + '\n', { flag: 'a' });
                    stats.unrefined_disabled++;
                    stats.total_disabled++;
                } else {
                    writeFileSync(unrefinedNotDisabledPath, iun + '\n', { flag: 'a' });
                    stats.unrefined_not_disabled++;
                    stats.total_not_disabled++;
                }
            }
        }
        process.stdout.write('\n');
        printSummary(stats, {
            refinedDisabledPath,
            refinedNotDisabledPath,
            unrefinedDisabledPath,
            unrefinedNotDisabledPath
        });
    } catch (error) {
        console.error('Error during execution:', error);
        process.exit(1);
    }
}

main().catch(console.error);