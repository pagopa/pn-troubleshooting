import { parseArgs } from 'util';
import { parse } from 'csv-parse';
import { readFileSync, writeFileSync } from 'fs';
import { GetObjectRetentionCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { AwsClientsWrapper } from "pn-common";
import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';

const VALID_ENVIRONMENTS = ['prod', 'uat', 'hotfix', 'test'];
const USAGE = `
Usage: node index.js --csvFile <path-to-csv> --envName <environment>

Description:
    Updates the retention date of documents in SafeStorage.

Parameters:
    --csvFile, -f    Required. Path to the CSV file containing document metadata
    --envName, -e    Required. Environment to use (prod|uat|hotfix)
    --help, -h       Display this help message
`;

function validateArgs() {
    const args = parseArgs({
        options: {
            csvFile: { type: "string", short: "f" },
            envName: { type: "string", short: "e" },
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

async function getRetention(s3Client, bucket, fileKey) {
    try {
        const command = new GetObjectRetentionCommand({ Bucket: bucket, Key: fileKey });
        const response = await s3Client.send(command);
        return response.Retention?.RetainUntilDate || null;
    } catch (error) {
        console.error(`Error fetching retention for ${fileKey}:`, error.message);
        return null;
    }
}

async function updateRetention(apiClient, fileKey, newRetentionDate) {
    const url = `${process.env.BASE_URL}/safe-storage/v1/files/${fileKey}`;
    const headers = {
        'x-pagopa-safestorage-cx-id': 'pn-delivery',
        'Content-Type': 'application/json'
    };

    try {
        await apiClient.post(url, { status: null, retentionUntil: newRetentionDate }, { headers });
    } catch (error) {
        console.error(`Error updating retention for ${fileKey}:`, error.message);
        throw error;
    }
}

function writeCSVOutput(outputPath, data) {
    const header = 'fileKey,previousTtl,updatedTtl\n';
    const rows = data.map(row => `${row.fileKey},${row.previousTtl},${row.updatedTtl}`).join('\n');
    writeFileSync(outputPath, header + rows, 'utf-8');
}

async function getBastionInstanceId(awsClient) {
    const ec2Client = awsClient._initEC2();
    const command = new DescribeInstancesCommand({
        Filters: [
            { Name: 'tag:Name', Values: ['*bastion*'] },
            { Name: 'instance-state-name', Values: ['running'] }
        ]
    });

    const response = await ec2Client.send(command);
    const instance = response.Reservations?.[0]?.Instances?.[0];
    if (!instance) {
        throw new Error('No running bastion instance found');
    }
    return instance.InstanceId;
}

async function main() {
    const { csvFile, envName } = validateArgs();
    const awsClient = new AwsClientsWrapper('core', envName);
    awsClient._initS3();
    const s3Client = awsClient._s3Client;

    const records = await parseCSV(csvFile);
    console.log(`Found ${records.length} records to process`);

    const accountId = (await awsClient._getCallerIdentity()).Account;
    const mainBucket = `pn-safestorage-eu-south-1-${accountId}`;
    const outputData = [];
    let processed = 0;

    const bastionInstanceId = await getBastionInstanceId(awsClient);
    const sessionId = await awsClient._startSSMPortForwardingSession(
        bastionInstanceId,
        'alb.confidential.pn.internal',
        8080,
        8888
    );

    try {
        for (const record of records) {
            const { fileKey, ttl } = record;

            if (!fileKey || !ttl) {
                console.warn('Skipping record - missing required fields:', record);
                continue;
            }

            const previousTtl = await getRetention(s3Client, mainBucket, fileKey);
            if (!previousTtl) {
                console.warn(`Skipping ${fileKey} - unable to fetch current retention`);
                continue;
            }

            try {
                await updateRetention(axios, fileKey, ttl);
                const updatedTtl = await getRetention(s3Client, mainBucket, fileKey);

                if (updatedTtl === ttl) {
                    outputData.push({ fileKey, previousTtl, updatedTtl });
                    processed++;
                } else {
                    console.warn(`Retention update verification failed for ${fileKey}`);
                }

                process.stdout.write(`\rProcessed ${processed}/${records.length} records`);
            } catch (error) {
                console.error(`Error processing ${fileKey}:`, error.message);
            }
        }
    } finally {
        await awsClient._terminateSSMSession(sessionId);
    }

    const outputPath = `retention_update_results_${new Date().toISOString().replace(/:/g, '-')}.csv`;
    writeCSVOutput(outputPath, outputData);

    console.log('\nProcessing complete!');
    console.log(`Successfully processed: ${processed}/${records.length} records`);
    console.log(`Results written to: ${outputPath}`);
}

main().catch(console.error);