import { AwsClientsWrapper } from "pn-common";
import { sleep } from "pn-common/libs/utils.js";
import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, appendFileSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { performance } from 'perf_hooks';
import { TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';

const accountType = "core";
const tableName = "pn-Action";
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

let outputPath;

function validateArgs() {
    const usage = `
Usage: node index.js --days <number> --fileName <csv file> [--env <env>] [--startActionId <actionId value>] [--batchSize <num>] [--concurrency <num>] [--maxRetries <num>] [--dryRun]

Parameters:
    --env            Optional. Environment (dev|uat|test|prod|hotfix)
    --days           Required. Number of days to add to TTL
    --fileName       Required. Path to CSV file (columns: actionId,ttl)
    --startActionId  Optional. Resume from this actionId
    --batchSize      Optional. Batch size for DynamoDB (default: 25, max: 25)
    --concurrency    Optional. Number of batches processed in parallel (default: 8)
    --maxRetries     Optional. Max retry attempts for failed batches (default: 5)
    --dryRun         Optional. Simulate updates without writing to DynamoDB
    --help           Show this help message
`;
    const args = parseArgs({
        options: {
            env: { type: "string", short: "e" },
            days: { type: "string", short: "d" },
            fileName: { type: "string", short: "f" },
            startActionId: { type: "string", short: "a" },
            batchSize: { type: "string", short: "b" },
            concurrency: { type: "string", short: "c" },
            maxRetries: { type: "string", short: "m" },
            dryRun: { type: "boolean" },
            help: { type: "boolean", short: "h" }
        }
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }
    if (!args.values.days || !args.values.fileName) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);
    }
    if (args.values.env && !VALID_ENVIRONMENTS.includes(args.values.env)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }
    const days = parseInt(args.values.days);
    if (isNaN(days)) {
        console.error("Error: days must be a valid number");
        process.exit(1);
    }
    args.values.days = days;
    args.values.batchSize = Math.min(25, parseInt(args.values.batchSize) || 25);
    args.values.concurrency = parseInt(args.values.concurrency) || 8;
    args.values.maxRetries = parseInt(args.values.maxRetries) || 5;
    args.values.dryRun = !!args.values.dryRun;
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
    appendFileSync(join(outputPath, 'failures.csv'), 'actionId,ttl,error\n', { flag: 'w' });
}

function batchLogFailures(failedItems) {
    if (!failedItems.length) return;
    const jsonPath = join(outputPath, 'failures.json');
    const csvPath = join(outputPath, 'failures.csv');
    let jsonLines = '';
    let csvLines = '';
    for (const item of failedItems) {
        jsonLines += JSON.stringify(item) + "\n";
        csvLines += `${item.actionId},${item.ttl},"${item.error.name}: ${item.error.message}"\n`;
    }
    appendFileSync(jsonPath, jsonLines);
    appendFileSync(csvPath, csvLines);
}

function printSummary(stats, executionTimeMs, dryRun) {
    const usedMemory = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    if (dryRun) {
        console.log('\n[DRY RUN MODE] Nessuna modifica è stata applicata a DynamoDB.');
    }
    console.log('\n=== Execution Summary ===');
    console.log(`Total records in CSV: ${stats.totalRecords}`);
    console.log(`Successfully updated: ${stats.successCount}`);
    console.log(`Failed updates: ${stats.failureCount}`);
    if (stats.lastFailedActionId) {
        console.log(`\nPer riprendere dall'ultimo elemento fallito, usa:`);
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

function buildTransactUpdate(row, newTtl) {
    return {
        Update: {
            TableName: tableName,
            Key: { actionId: { S: row.actionId } },
            UpdateExpression: "SET #ttl = :newttl",
            ExpressionAttributeNames: { "#ttl": "ttl" },
            ExpressionAttributeValues: { ":newttl": { N: newTtl.toString() } },
            ConditionExpression: "attribute_exists(actionId)"
        }
    };
}

async function processBatchTransactWrite(batch, dynDbClient, maxRetries, dryRun) {
    if (dryRun) {
        return { success: batch.length, failed: 0, failedItems: [] };
    }
    let attempt = 0;
    let backoff = 100;
    let failedItems = [];
    const transactItems = batch.map(item => item.transaction);
    while (attempt < maxRetries) {
        try {
            await dynDbClient._dynamoClient.send(
                new TransactWriteItemsCommand({
                    TransactItems: transactItems
                }),
                await sleep(5)
            );
            return { success: batch.length, failed: 0, failedItems: [] };
        } catch (e) {
            if (e.name === "TransactionCanceledException" && e.CancellationReasons) {
                failedItems = [];
                for (let i = 0; i < e.CancellationReasons.length; i++) {
                    if (e.CancellationReasons[i]?.Code !== undefined && e.CancellationReasons[i].Code !== "None") {
                        failedItems.push({
                            actionId: batch[i].transaction.Update.Key.actionId.S,
                            ttl: batch[i].originalTtl,
                            error: { name: e.CancellationReasons[i].Code, message: e.CancellationReasons[i].Message || "" }
                        });
                    }
                }
                const onlyConditional = failedItems.every(f => f.error.name === "ConditionalCheckFailed");
                if (onlyConditional) {
                    return { success: batch.length - failedItems.length, failed: failedItems.length, failedItems };
                }
            }
            if (
                e.name === "ProvisionedThroughputExceededException" ||
                e.name === "ThrottlingException" ||
                e.name === "InternalServerError" ||
                e.name === "TransactionInProgressException" ||
                e.name === "TransactionCanceledException"
            ) {
                await new Promise(res => setTimeout(res, backoff));
                backoff *= 2;
                attempt++;
                continue;
            }
            throw e;
        }
    }
    failedItems = batch.map(item => ({
        actionId: item.transaction.Update.Key.actionId.S,
        ttl: item.originalTtl,
        error: { name: "MaxRetriesExceeded", message: "Batch failed after max retries" }
    }));
    return { success: 0, failed: batch.length, failedItems };
}

async function processFileStream(args, dynDbClient) {
    const { fileName, days, startActionId, batchSize, concurrency, maxRetries, dryRun } = args;
    const stats = {
        totalRecords: 0,
        successCount: 0,
        failureCount: 0,
        lastFailedActionId: null
    };
    const batchQueue = [];
    const maxQueueSize = concurrency * 2;
    let readingPaused = false;
    let streamFinished = false;
    let resolveQueueSpace;

    const failedItemsBuffer = [];

    function logFailures() {
        if (failedItemsBuffer.length > 0) {
            batchLogFailures(failedItemsBuffer.splice(0));
        }
    }

    async function worker() {
        while (true) {
            if (batchQueue.length === 0) {
                if (streamFinished) break;
                await sleep(50);
                continue;
            }

            const { batch, firstActionId } = batchQueue.shift();
            if (readingPaused && batchQueue.length < maxQueueSize / 2) {
                readingPaused = false;
                if (resolveQueueSpace) resolveQueueSpace();
            }

            try {
                const result = await processBatchTransactWrite(batch, dynDbClient, maxRetries, dryRun);
                stats.successCount += result.success;
                stats.failureCount += result.failed;
                if (result.failedItems.length) {
                    failedItemsBuffer.push(...result.failedItems);
                    stats.lastFailedActionId = result.failedItems[0].actionId;
                }
            } catch (e) {
                for (const item of batch) {
                    failedItemsBuffer.push({
                        actionId: item.transaction.Update.Key.actionId.S,
                        ttl: item.originalTtl,
                        error: { name: e.name, message: e.message }
                    });
                }
                stats.failureCount += batch.length;
                stats.lastFailedActionId = batch[0].transaction.Update.Key.actionId.S;
            }
            
            if (failedItemsBuffer.length >= 100) {
                logFailures();
            }
            process.stdout.write(`Total processed: ${stats.successCount + stats.failureCount} `);
        }
    }

    const workers = Array.from({ length: concurrency }, () => worker());

    let currentBatch = [];
    let foundStartId = !startActionId;

    await pipeline(
        createReadStream(fileName),
        parse({ columns: true, skip_empty_lines: true }),
        new Transform({
            objectMode: true,
            async transform(row, _, cb) {
                stats.totalRecords++;
                if (!foundStartId) {
                    foundStartId = row.actionId === startActionId;
                    if (!foundStartId) return cb();
                }

                if (!row.actionId || isNaN(parseInt(row.ttl))) {
                    failedItemsBuffer.push({
                        actionId: row.actionId || '',
                        ttl: row.ttl || '',
                        error: { name: 'InvalidRow', message: 'Missing actionId or invalid ttl' }
                    });
                    stats.failureCount++;
                    stats.lastFailedActionId = row.actionId || '';
                    return cb();
                }

                const newTtl = computeNewTtl(days, row.ttl);
                currentBatch.push({
                    transaction: buildTransactUpdate(row, newTtl),
                    originalTtl: row.ttl
                });

                if (currentBatch.length >= batchSize) {
                    batchQueue.push({ batch: currentBatch, firstActionId: row.actionId });
                    currentBatch = [];
                    if (batchQueue.length >= maxQueueSize) {
                        readingPaused = true;
                        await new Promise(res => { resolveQueueSpace = res; });
                    }
                }
                cb();
            },
            flush(cb) {
                if (currentBatch.length > 0) {
                    batchQueue.push({ batch: currentBatch, firstActionId: currentBatch[0].transaction.Update.Key.actionId.S });
                }
                streamFinished = true;
                cb();
            }
        })
    );

    await Promise.all(workers);
    logFailures(); // Log any remaining failures
    return stats;
}


async function main() {
    const startTime = performance.now();
    const args = validateArgs();
    
    initializeResultsFiles(args.env);

    const dynDbClient = args.env
        ? new AwsClientsWrapper(accountType, args.env)
        : new AwsClientsWrapper();
    dynDbClient._initDynamoDB();

    const stats = await processFileStream(args, dynDbClient);

    process.stdout.write('\n');
    printSummary(stats, performance.now() - startTime, args.dryRun);
}

main();

