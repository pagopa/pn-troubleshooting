const { AwsClientsWrapper } = require("pn-common");
const { parseArgs } = require('node:util');
const { existsSync, mkdirSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');
const { parse } = require('csv-parse');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const { performance } = require('perf_hooks');

const accountType = "core";
const tableName = "pn-Action";
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

let outputPath;

function validateArgs() {
    const usage = `
Usage: node index.js [--region <region>] --env <env> --days <number> --fileName <csv file> [--startActionId <actionId value>]

Parameters:
    --region         Optional. AWS region (default: eu-south-1)
    --env            Required. Environment (dev|uat|test|prod|hotfix)
    --days           Required. Number of days to add to TTL
    --fileName       Required. Path to CSV file (columns: actionId,ttl)
    --startActionId  Optional. Resume from this actionId
    --help           Show this help message
`;
    const args = parseArgs({
        options: {
            region: { type: "string", short: "r", default: "eu-south-1" },
            env: { type: "string", short: "e" },
            days: { type: "string", short: "d" },
            fileName: { type: "string", short: "f" },
            startActionId: { type: "string", short: "a" },
            help: { type: "boolean", short: "h" }
        }
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }
    if (!args.values.env || !args.values.days || !args.values.fileName) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);
    }
    if (!VALID_ENVIRONMENTS.includes(args.values.env)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }
    const days = parseInt(args.values.days);
    if (isNaN(days)) {
        console.error("Error: days must be a valid number");
        process.exit(1);
    }
    args.values.days = days;
    return args.values;
}

function getTimestampFolderName() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
}

function initializeResultsFiles(env) {
    if (!existsSync('results')) mkdirSync('results');
    const timestampDir = getTimestampFolderName();
    const timestampPath = join('results', timestampDir);
    if (!existsSync(timestampPath)) mkdirSync(timestampPath);
    outputPath = env ? join(timestampPath, env) : timestampPath;
    if (env && !existsSync(outputPath)) mkdirSync(outputPath);
    appendFileSync(join(outputPath, 'failures.json'), '', { flag: 'w' });
    appendFileSync(join(outputPath, 'failures.csv'), 'actionId,error\n', { flag: 'w' });
}

function logFailure(data) {
    appendFileSync(join(outputPath, 'failures.json'), JSON.stringify(data) + "\n");
    appendFileSync(join(outputPath, 'failures.csv'), `${data.actionId},"${data.error.name}: ${data.error.message}"\n`);
}

function printSummary(stats, executionTimeMs) {
    const usedMemory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    console.log('\n=== Execution Summary ===');
    console.log(`Total records in CSV: ${stats.totalRecords}`);
    console.log(`Successfully updated: ${stats.successCount}`);
    console.log(`Failed updates: ${stats.failureCount}`);
    if (stats.lastFailedActionId) {
        console.log(`\nTo resume from the last failed item, use:`);
        console.log(`--startActionId "${stats.lastFailedActionId}"`);
    }
    console.log('\n=== Performance Metrics ===');
    console.log(`Execution time: ${(executionTimeMs / 1000).toFixed(2)} seconds`);
    console.log(`Heap Used: ${(usedMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Heap Total: ${(usedMemory.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`RSS: ${(usedMemory.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`User CPU time: ${(cpuUsage.user / 1000000).toFixed(2)} seconds`);
    console.log(`System CPU time: ${(cpuUsage.system / 1000000).toFixed(2)} seconds`);
}

function computeNewTtl(days, csvTtl) {
    return parseInt(csvTtl) + (days * 86400);
}

function buildUpdateInput(pk, ttlAttr, row, newTtl) {
    return {
        keys: { [pk]: row[pk] },
        values: {
            [ttlAttr]: {
                codeAttr: '#' + ttlAttr,
                codeValue: ':new' + ttlAttr,
                value: newTtl
            }
        }
    };
}

async function processBatchWithRetries(batch, dynDbClient, stats) {
    let retries = 0;
    let failedItems = [];
    while (batch.length > 0 && retries < 3) {
        const promises = batch.map(async ({ row, input }) => {
            try {
                await dynDbClient._updateItem(
                    tableName,
                    input.keys,
                    input.values,
                    'SET',
                    `attribute_exists(#ttl)`
                );
                stats.successCount++;
                return null;
            } catch (e) {
                if (e.name === "ConditionalCheckFailedException") {
                    stats.failureCount++;
                    logFailure({ actionId: row.actionId, error: { name: e.name, message: e.message } });
                    stats.lastFailedActionId = row.actionId;
                    return null;
                } else {
                    return { row, input, error: e };
                }
            }
        });
        const results = await Promise.all(promises);
        failedItems = results.filter(x => x !== null);
        if (failedItems.length > 0 && retries < 2) {
            await new Promise(res => setTimeout(res, 100));
            batch = failedItems;
            retries++;
        } else {
            for (const fail of failedItems) {
                stats.failureCount++;
                logFailure({ actionId: fail.row.actionId, error: { name: fail.error.name, message: fail.error.message } });
                stats.lastFailedActionId = fail.row.actionId;
            }
            break;
        }
    }
}

async function main() {
    const startTime = performance.now();
    const args = validateArgs();
    const { env, days, fileName, startActionId } = args;

    initializeResultsFiles(env);

    let dynDbClient = env
        ? new AwsClientsWrapper(accountType, env)
        : new AwsClientsWrapper();
    dynDbClient._initDynamoDB();

    let batch = [];
    const BATCH_SIZE = 25;
    let stats = {
        totalRecords: 0,
        successCount: 0,
        failureCount: 0,
        lastFailedActionId: null
    };
    let foundStartId = !startActionId;

    const processor = new Transform({
        objectMode: true,
        transform: async function (row, encoding, callback) {
            stats.totalRecords++;
            if (!foundStartId) {
                foundStartId = row.actionId === startActionId;
                if (!foundStartId) return callback();
            }
            if (!row.actionId || isNaN(parseInt(row.ttl))) {
                stats.failureCount++;
                logFailure({ actionId: row.actionId || '', error: { name: 'InvalidRow', message: 'Missing actionId or invalid ttl' } });
                stats.lastFailedActionId = row.actionId || '';
                return callback();
            }
            const newTtl = computeNewTtl(days, row.ttl);
            const input = buildUpdateInput("actionId", "ttl", row, newTtl);
            batch.push({ row, input });
            if (batch.length >= BATCH_SIZE) {
                await processBatchWithRetries(batch, dynDbClient, stats);
                process.stdout.write(`\rProcessed: ${stats.successCount + stats.failureCount}`);
                batch = [];
            }
            callback();
        },
        flush: async function (callback) {
            if (batch.length > 0) {
                await processBatchWithRetries(batch, dynDbClient, stats);
                process.stdout.write(`\rProcessed: ${stats.successCount + stats.failureCount}`);
            }
            callback();
        }
    });

    try {
        await pipeline(
            require('fs').createReadStream(fileName),
            parse({ columns: true, skip_empty_lines: true }),
            processor
        );
    } catch (err) {
        console.error('Fatal error:', err);
        process.exit(1);
    }

    process.stdout.write('\n');
    printSummary(stats, performance.now() - startTime);
}

main();
