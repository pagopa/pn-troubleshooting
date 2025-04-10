// Required dependencies
import { readFileSync, appendFileSync } from 'fs';
import { parseArgs } from 'util';
import { AwsClientsWrapper } from "pn-common";
import { ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];
const VALID_COMMANDS = ['s3-cleanup', 'ddb-update'];

function printUsage() {
    console.log(`
Usage: node index.js --envName|-e <environment> --inputFile|-i <path> --command|-c <command> [--dryRun|-d]

Parameters:
    --envName, -e     Required. Environment (dev|uat|test|prod|hotfix)
    --inputFile, -i   Required. TXT file with list of fileKeys (one per line)
    --command, -c     Required. Subcommand: s3-cleanup | ddb-update
    --dryRun, -d      Optional. Simulate execution without making changes

Examples:
    node index.js -e dev -i ./filekeys.txt -c s3-cleanup
    node index.js --envName prod --inputFile ./keys.txt --command ddb-update
    node index.js -e test -i ./keys.txt -c s3-cleanup --dryRun
    `);
    process.exit(1);
}

const args = parseArgs({
    options: {
        envName: { type: "string", short: "e" },
        inputFile: { type: "string", short: "i" },
        command: { type: "string", short: "c" },
        dryRun: { type: "boolean", short: "d" },
        help: { type: "boolean", short: "h" }
    },
    strict: true
});

if (args.values.help) printUsage();
const { envName, inputFile, command, dryRun } = args.values;

if (!envName || !inputFile || !command) {
    console.error("Error: Missing required parameters.");
    printUsage();
}

if (!VALID_ENVIRONMENTS.includes(envName)) {
    console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
    process.exit(1);
}

if (!VALID_COMMANDS.includes(command)) {
    console.error(`Error: Invalid command. Must be one of: ${VALID_COMMANDS.join(', ')}`);
    process.exit(1);
}

// Read the fileKeys from the input file
let fileKeys;
try {
    const content = readFileSync(inputFile, 'utf-8');
    fileKeys = content.split('\n').map(s => s.trim()).filter(s => s);
} catch (error) {
    console.error("Error reading input file:", error);
    process.exit(1);
}

(async function main() {
    console.log(`Starting ${command} in ${envName} environment...`);
    console.log(`Processing ${fileKeys.length} fileKeys from ${inputFile}`);

    // Initialize AWS clients
    const awsClient = new AwsClientsWrapper('confinfo', envName);
    awsClient._initS3();
    awsClient._initDynamoDB();
    awsClient._initSTS();

    // Retrieve the account ID via STS
    let accountId;
    try {
        const identity = await awsClient._getCallerIdentity();
        accountId = identity.Account;
        console.log(`Account ID: ${accountId}`);
    } catch (error) {
        console.error("Error retrieving account ID:", error);
        process.exit(1);
    }

    // For s3-cleanup, build bucket name
    const bucketName = `pn-safestorage-eu-south-1-${accountId}`;

    // Initialize counters and prepare output files
    let total = 0, successCount = 0, failedCount = 0;
    let deletedOutputFile, skippedOutputFile;
    if (command === 's3-cleanup') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        deletedOutputFile = `s3_deleted_${timestamp}.txt`;
        skippedOutputFile = `s3_skipped_${timestamp}.txt`;
        console.log(`S3 cleanup - deleted output: ${deletedOutputFile}`);
        console.log(`S3 cleanup - skipped output: ${skippedOutputFile}`);
    }

    for (const fileKey of fileKeys) {
        total++;
        process.stdout.write(`\rProcessing ${total} of ${fileKeys.length}`);
        try {
            if (command === 's3-cleanup') {
                // List object versions for fileKey
                const listCmd = new ListObjectVersionsCommand({
                    Bucket: bucketName,
                    Prefix: fileKey
                });
                const versionsData = await awsClient._s3Client.send(listCmd);
                const versions = versionsData.Versions || [];
                // Filter versions matching exactly the fileKey
                const matchingVersions = versions.filter(v => v.Key === fileKey);
                if (matchingVersions.length >= 2) {
                    // Sort versions by LastModified, descending (latest first)
                    matchingVersions.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
                    const latest = matchingVersions[0];
                    if (!dryRun) {
                        // Delete latest version if not in dry run
                        const deleteCmd = new DeleteObjectCommand({
                            Bucket: bucketName,
                            Key: fileKey,
                            VersionId: latest.VersionId
                        });
                        await awsClient._s3Client.send(deleteCmd);
                        console.log(`\nDeleted latest version (${latest.VersionId}) for ${fileKey}`);
                    } else {
                        console.log(`\n[DryRun] Would delete latest version (${latest.VersionId}) for ${fileKey}`);
                    }
                    // Record fileKey as cleaned (deleted or simulated deletion)
                    appendFileSync(deletedOutputFile, fileKey + "\n");
                    successCount++;
                } else {
                    console.log(`\nSkipping ${fileKey}: less than 2 versions.`);
                    // Record fileKey as skipped
                    appendFileSync(skippedOutputFile, fileKey + "\n");
                }
            } else if (command === 'ddb-update') {
                if (!dryRun) {
                    const updateCmd = new UpdateItemCommand({
                        TableName: 'pn-SsDocumenti',
                        Key: {
                            documentKey: { S: fileKey }
                        },
                        UpdateExpression: 'SET documentLogicalState = :saved, documentState = :available',
                        ExpressionAttributeValues: {
                            ':saved': { S: 'SAVED' },
                            ':available': { S: 'available' }
                        }
                    });
                    await awsClient._dynamoClient.send(updateCmd);
                    console.log(`\nUpdated document for ${fileKey}`);
                } else {
                    console.log(`\n[DryRun] Would update document for ${fileKey}`);
                }
                successCount++;
            }
        } catch (error) {
            console.error(`\nError processing ${fileKey}:`, error.message);
            failedCount++;
        }
    }

    console.log("\n\n=== Execution Summary ===");
    console.log(`Total fileKeys processed: ${total}`);
    console.log(`Successful operations: ${successCount}`);
    console.log(`Failed operations: ${failedCount}`);
})();