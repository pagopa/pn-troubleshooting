import { parseArgs } from 'util';
import fs from 'fs';
import { parse } from 'csv-parse';
import { readFileSync, writeFileSync } from 'fs';
import { GetObjectRetentionCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { AwsClientsWrapper } from "pn-common";
import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env` });

const SS_ALB_ENDPOINT = process.env.SS_ALB_ENDPOINT || 'alb.confidential.pn.internal';
const SSM_FORWARD_PORT = parseInt(process.env.SSM_FORWARD_PORT, 10) || 8080;
const SSM_LOCAL_PORT = parseInt(process.env.SSM_LOCAL_PORT, 10) || 8888;
const SS_BASE_URL = process.env.SS_BASE_URL || 'http://127.0.0.1';

const VALID_ENVIRONMENTS = ['prod', 'uat', 'hotfix', 'test'];
const USAGE = `
Usage: node index.js --csvFile <path-to-csv> --envName <environment> [--update]

Description:
    By default, prints the current retention date of fileKeys in the CSV.
    If --update is provided, updates the retention date of documents in SafeStorage.

Parameters:
    --csvFile, -f    Required. Path to the CSV file containing document metadata
    --envName, -e    Required. Environment to use (prod|uat|hotfix)
    --update, -u     Optional. If set, updates the retention date
    --help, -h       Display this help message
`;

function validateArgs() {
    const args = parseArgs({
        options: {
            csvFile: { type: "string", short: "f" },
            envName: { type: "string", short: "e" },
            update: { type: "boolean", short: "u" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(USAGE);
        process.exit(0);
    }

    if (!args.values.csvFile || !args.values.envName) {
        console.error("Error: Missing required parameters --csvFile and/or --envName");
        console.log(USAGE);
        process.exit(1);
    }

    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
        console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
        process.exit(1);
    }

    return args.values;
}

function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        const fileContent = readFileSync(filePath, 'utf-8');
        
        parse(fileContent, {
            columns: true,
            delimiter: ',',
            trim: true
        })
        .on('data', (data) => results.push(data))
        .on('error', (err) => reject(err))
        .on('end', () => resolve(results));
    });
}

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isISO8601(str) {
    return typeof str === 'string' && ISO_8601_REGEX.test(str);
}

function toISO8601(date) {
    if (!date) return '';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString();
    } catch {
        return '';
    }
}

function validateCSVHeaders(records) {
    if (!records.length) {
        console.error("Error: CSV file is empty.");
        process.exit(1);
    }
    const requiredColumns = ['fileKey', 'retentionUntil'];
    const recordKeys = Object.keys(records[0]);
    const missing = requiredColumns.filter(col => !recordKeys.includes(col));
    if (missing.length) {
        console.error(`Error: CSV missing required columns: ${missing.join(', ')}`);
        process.exit(1);
    }
    let invalidRows = [];
    records.forEach((row, idx) => {
        if (row.retentionUntil && !isISO8601(row.retentionUntil)) {
            invalidRows.push(idx + 2);
        }
    });
    if (invalidRows.length) {
        console.error(`Error: The following rows have non-ISO 8601 retentionUntil values: ${invalidRows.join(', ')}`);
        console.error('Expected format: YYYY-MM-DDTHH:mm:ss.sssZ (e.g., 2024-06-01T12:00:00.000Z)');
        process.exit(1);
    }
}

async function getRetention(s3Client, bucket, fileKey) {
    try {
        const command = new GetObjectRetentionCommand({ Bucket: bucket, Key: fileKey });
        const response = await s3Client.send(command);
        return response.Retention?.RetainUntilDate ? toISO8601(response.Retention.RetainUntilDate) : null;
    } catch (error) {
        console.error(`Error fetching retention for ${fileKey}:`, error && error.message ? error.message : String(error));
        return null;
    }
}

async function updateRetention(apiClient, fileKey, newRetentionUntil) {
    if (!isISO8601(newRetentionUntil)) {
        throw new Error(`retentionUntil value is not ISO 8601: ${newRetentionUntil}`);
    }
    const url = `${SS_BASE_URL}:${SSM_LOCAL_PORT}/safe-storage/v1/files/${fileKey}`;
    const headers = {
        'x-pagopa-safestorage-cx-id': 'pn-delivery',
        'Content-Type': 'application/json'
    };

    try {
        await apiClient.post(url, { status: null, retentionUntil: newRetentionUntil }, { headers });
    } catch (error) {
        console.error(`Error updating retention for ${fileKey}:`, error && error.message ? error.message : String(error));
        throw error;
    }
}

function writeCSVOutput(outputPath, data, updateMode) {
    let header, rows;
    if (!updateMode) {
        header = 'fileKey,currentRetentionUntil,status,error\n';
        rows = data.map(row =>
            `${row.fileKey},${toISO8601(row.previousRetentionUntil) || ''},${row.status || ''},${row.error ? `"${row.error.replace(/"/g, '""')}"` : ''}`
        ).join('\n');
    } else {
        header = 'fileKey,previousRetentionUntil,updatedRetentionUntil,status,error\n';
        rows = data.map(row =>
            `${row.fileKey},${toISO8601(row.previousRetentionUntil) || ''},${toISO8601(row.updatedRetentionUntil) || ''},${row.status || ''},${row.error ? `"${row.error.replace(/"/g, '""')}"` : ''}`
        ).join('\n');
    }
    const resultsDir = path.join(__dirname, 'results');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    writeFileSync(path.join(resultsDir, outputPath), header + rows, 'utf-8');
}

let confinfoClient = null;
let coreClient = null;
let portForwardProcess = null;

async function startPortForwarding(instanceId, localPort, remoteHost, remotePort, envName) {
    const profile = `sso_pn-core-${envName}`;
    const args = [
        'ssm', 'start-session',
        '--target', instanceId,
        '--document-name', 'AWS-StartPortForwardingSessionToRemoteHost',
        '--parameters', `portNumber=${remotePort},localPortNumber=${localPort},host=${remoteHost}`,
        '--profile', profile
    ];
    console.log(`Starting AWS CLI port forwarding: aws ${args.join(' ')}`);
    const proc = spawn('aws', args, { stdio: 'inherit' });

    await new Promise(resolve => setTimeout(resolve, 5000));
    return proc;
}

function stopPortForwarding(proc) {
    if (proc && !proc.killed) {
        proc.kill();
        console.log('Port forwarding process terminated.');
    }
}

async function handleExit(signal) {
    console.log(`\nReceived ${signal}, cleaning up...`);
    if (portForwardProcess) {
        stopPortForwarding(portForwardProcess);
    }
    process.exit(1);
}

process.on('SIGINT', () => handleExit('SIGINT'));
process.on('SIGTERM', () => handleExit('SIGTERM'));

async function main() {
    const { csvFile, envName, update } = validateArgs();

    confinfoClient = new AwsClientsWrapper('confinfo', envName);
    coreClient = new AwsClientsWrapper('core', envName);

    confinfoClient._initSTS();
    confinfoClient._initS3();
    coreClient._initEC2();
    coreClient._initSSM();

    const records = await parseCSV(csvFile);
    validateCSVHeaders(records);
    console.log(`Found ${records.length} records to process`);

    const accountId = (await confinfoClient._getCallerIdentity()).Account;
    const mainBucket = `pn-safestorage-eu-south-1-${accountId}`;
    const outputData = [];
    let processed = 0;

    if (!update) {
        for (const record of records) {
            const { fileKey } = record;
            if (!fileKey) {
                console.warn('Skipping record - Missing fileKey:', record);
                outputData.push({
                    fileKey: fileKey || '',
                    previousRetentionUntil: '',
                    status: 'skipped',
                    error: 'Missing fileKey'
                });
                continue;
            }
            let previousRetentionUntil = null;
            try {
                previousRetentionUntil = await getRetention(confinfoClient._s3Client, mainBucket, fileKey);
                processed++;
            } catch (error) {
                console.error(`Error fetching retention for ${fileKey}:`, error && error.message ? error.message : String(error));
            }
            outputData.push({
                fileKey,
                previousRetentionUntil,
                status: 'queried',
                error: ''
            });
            process.stdout.write(`\rProcessed ${processed}/${records.length} records`);
        }
        process.stdout.write('\n');
        const outputPath = `retention_query_results_${new Date().toISOString().replace(/:/g, '-')}.csv`;
        writeCSVOutput(outputPath, outputData, false);
        console.log('Query complete!');
        console.log(`Successfully processed: ${processed}/${records.length} records`);
        console.log(`Results written to: results/${outputPath}`);
        return;
    }

    const bastionInstanceId = await getBastionInstanceId(coreClient);
    portForwardProcess = await startPortForwarding(
        bastionInstanceId,
        SSM_LOCAL_PORT,
        SS_ALB_ENDPOINT,
        SSM_FORWARD_PORT,
        envName
    );

    try {
        for (const record of records) {
            const { fileKey, retentionUntil } = record;

            if (!fileKey || !retentionUntil) {
                const msg = 'Missing required fields';
                console.warn(`Skipping record - ${msg}:`, record);
                outputData.push({
                    fileKey: fileKey || '',
                    previousRetentionUntil: '',
                    updatedRetentionUntil: '',
                    status: 'skipped',
                    error: msg
                });
                continue;
            }

            if (!isISO8601(retentionUntil)) {
                const msg = 'retentionUntil is not ISO 8601';
                console.warn(`Skipping record - ${msg}:`, record);
                outputData.push({
                    fileKey,
                    previousRetentionUntil: '',
                    updatedRetentionUntil: '',
                    status: 'skipped',
                    error: msg
                });
                continue;
            }

            let previousRetentionUntil = null;
            let updatedRetentionUntil = null;
            let status = '';
            let errorMsg = '';

            try {
                previousRetentionUntil = await getRetention(confinfoClient._s3Client, mainBucket, fileKey);
                if (!previousRetentionUntil) {
                    status = 'skipped';
                    errorMsg = 'Unable to fetch current retention';
                    console.warn(`Skipping ${fileKey} - ${errorMsg}`);
                    outputData.push({
                        fileKey,
                        previousRetentionUntil: '',
                        updatedRetentionUntil: '',
                        status,
                        error: errorMsg
                    });
                    continue;
                }

                await updateRetention(axios, fileKey, retentionUntil);
                updatedRetentionUntil = await getRetention(confinfoClient._s3Client, mainBucket, fileKey);

                if (areDatesEqual(updatedRetentionUntil, retentionUntil)) {
                    status = 'success';
                    processed++;
                } else {
                    status = 'verification_failed';
                    errorMsg = 'Retention update verification failed';
                    console.warn(`${errorMsg} for ${fileKey}`);
                }
            } catch (error) {
                status = 'error';
                let rawMsg = error && error.message ? error.message : String(error);
                errorMsg = rawMsg.split('\n')[0];
                console.error(`Error processing ${fileKey}:`, errorMsg);
            }

            outputData.push({
                fileKey,
                previousRetentionUntil,
                updatedRetentionUntil,
                status,
                error: errorMsg
            });

            process.stdout.write(`\rProcessed ${processed}/${records.length} records`);
        }
        process.stdout.write('\n');
    } finally {
        if (portForwardProcess) {
            stopPortForwarding(portForwardProcess);
            portForwardProcess = null;
        }
    }

    const outputPath = `retention_update_results_${new Date().toISOString().replace(/:/g, '-')}.csv`;
    writeCSVOutput(outputPath, outputData, true);

    console.log('Processing complete!');
    console.log(`Successfully processed: ${processed}/${records.length} records`);
    console.log(`Results written to: results/${outputPath}`);
}

async function getBastionInstanceId(awsClient) {
    const command = new DescribeInstancesCommand({
        Filters: [
            { Name: 'tag:Name', Values: ['*bastion*'] },
            { Name: 'instance-state-name', Values: ['running'] }
        ]
    });

    const response = await awsClient._ec2Client.send(command);
    const instance = response.Reservations?.[0]?.Instances?.[0];
    if (!instance) {
        throw new Error('No running bastion instance found');
    }
    return instance.InstanceId;
}

function areDatesEqual(dateA, dateB) {
    if (!dateA || !dateB) return false;
    try {
        const isoA = toISO8601(dateA);
        const isoB = toISO8601(dateB);
        return isoA === isoB;
    } catch {
        return false;
    }
}

main().catch(err => {
    console.error('Fatal error:', err && err.message ? err.message : String(err));
    if (portForwardProcess) {
        stopPortForwarding(portForwardProcess);
    }
    process.exit(1);
});