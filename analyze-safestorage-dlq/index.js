import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { AwsClientsWrapper } from "pn-common";
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { GetItemCommand } from '@aws-sdk/client-dynamodb';
import { parseArgs } from 'util';
import { HeadObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
const VALID_ENVIRONMENTS = ['dev', 'uat', 'test', 'prod', 'hotfix'];

const DOCUMENT_TYPES = {
    ATTACHED: [
            'PN_PRINTED',
            'PN_NOTIFICATION_ATTACHMENTS',
            'PN_F24_META'
    ],
    SAVED: [
            'PN_AAR',
            'PN_F24',
            'PN_F24_META',
            'PN_LEGAL_FACTS',
            'PN_EXTERNAL_LEGAL_FACTS',
            'PN_PAPER_ATTACHMENT',
            'PN_ADDRESSES_RAW',
            'PN_ADDRESSES_NORMALIZED',
            'PN_LOGS_ARCHIVE_AUDIT2Y',
            'PN_LOGS_ARCHIVE_AUDIT5Y',
            'PN_LOGS_ARCHIVE_AUDIT10Y'
    ],
    TIMELINE_CHECK: ['PN_AAR', 'PN_LEGAL_FACTS']
};

const BASE_CONFIGS = {
    safestorageMain: {
            requireS3Check: true,
            requireTimelineCheck: true,
            requireDocumentStateCheck: true,
            documentConfig: {
                    tableName: 'pn-SsDocumenti',
                    ATTACHED_TYPES: DOCUMENT_TYPES.ATTACHED,
                    SAVED_TYPES: DOCUMENT_TYPES.SAVED,
                    timelineCheckTypes: DOCUMENT_TYPES.TIMELINE_CHECK
            }
    },
    safestorageStaging: {
            requireS3Check: true,
            requireTimelineCheck: false,
            requireDocumentStateCheck: true,
            documentConfig: {
                    tableName: 'pn-SsDocumenti',
                    ATTACHED_TYPES: DOCUMENT_TYPES.ATTACHED,
                    SAVED_TYPES: DOCUMENT_TYPES.SAVED
            }
    },
    safestorageToDeliveryPush: {
            requireS3Check: false,
            requireTimelineCheck: false,
            requireDocumentStateCheck: false,
            documentConfig: {
                    tableName: 'pn-DocumentCreationRequestTable'
            }
    }
};

const QUEUE_CONFIGS = {
    'pn-ss-main-bucket-events-queue-DLQ': BASE_CONFIGS.safestorageMain,
    'pn-ss-staging-bucket-events-queue-DLQ': BASE_CONFIGS.safestorageStaging,
    'pn-ss-transformation-sign-and-timemark-queue-DLQ': BASE_CONFIGS.safestorageStaging,
    'pn-safestore_to_deliverypush-DLQ': BASE_CONFIGS.safestorageToDeliveryPush
};

function validateArgs() {
    const usage = `
Usage: node index.js --envName|-e <environment> --dumpFile|-f <path> --queueName|-q <queue>

Description:
        Analyzes SS DLQ events queue and checks related documents for events that can be safely removed.

Parameters:
        --envName, -e     Required. Environment to check (dev|uat|test|prod|hotfix)
        --dumpFile, -f    Required. Path to the SQS dump file
        --queueName, -q   Required. Name of the DLQ to analyze (${Object.keys(QUEUE_CONFIGS).join('|')})
        --help, -h        Display this help message

Example:
        node index.js --envName dev --dumpFile ./dump.json --queueName pn-ss-main-bucket-events-queue-DLQ`;
        
    const args = parseArgs({
            options: {
                    envName: { type: "string", short: "e" },
                    dumpFile: { type: "string", short: "f" },
                    queueName: { type: "string", short: "q" },
                    help: { type: "boolean", short: "h" }
            },
            strict: true
    });
    
    if (args.values.help) {
            console.log(usage);
            process.exit(0);
    }
    
    if (!args.values.envName || !args.values.dumpFile || !args.values.queueName) {
            console.error("Error: Missing required parameters --envName, --dumpFile and/or --queueName");
            console.log(usage);
            process.exit(1);
    }
    
    if (!VALID_ENVIRONMENTS.includes(args.values.envName)) {
            console.error(`Error: Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`);
            process.exit(1);
    }
    
    if (!QUEUE_CONFIGS[args.values.queueName]) {
            console.error(`Error: Invalid queue name. Must be one of: ${Object.keys(QUEUE_CONFIGS).join(', ')}`);
            process.exit(1);
    }

    const dumpFilename = args.values.dumpFile.split('/').pop();
    if (!dumpFilename.startsWith(`dump_${args.values.queueName}`)) {
        console.error(`Error: dump file name doesn't match with queue name "${args.values.queueName}"`);
        process.exit(1);
    }
    
    return args;
}

let safeToDeleteFilename, needFurtherAnalysisFilename;

function printSummary(stats, queueName) {
        console.log('\n=== Execution Summary for Queue: ' + queueName + ' ===');
        console.log(`\nTotal messages processed: ${stats.total}`);
        console.log(`Messages that passed: ${stats.passed}`);
        console.log(`Messages that failed: ${stats.total - stats.passed}`);
        console.log('\nFailures breakdown:');
        if (stats.docCreationRequestFailed !== undefined) {
                console.log(`- Document creation request found: ${stats.docCreationRequestFailed}`);
        } else {
                console.log(`- S3 bucket checks failed: ${stats.s3Failed}`);
                console.log(`- Document state checks failed: ${stats.stateCheckFailed}`);
                console.log(`- Timeline checks failed: ${stats.timelineFailed}`);
        }
        console.log('\nResults written to:');
        console.log(`- Failed messages: ${needFurtherAnalysisFilename}`);
        console.log(`- Passed messages: ${safeToDeleteFilename}`);
}

async function initializeAwsClients(awsClient) {
        awsClient._initS3();
        awsClient._initDynamoDB();
        awsClient._initSTS();
        awsClient._initSQS();
    
        return {
                s3Client: awsClient._s3Client,
                dynamoDBClient: awsClient._dynamoClient,
                stsClient: awsClient._stsClient,
                sqsClient: awsClient._sqsClient
        };
}

function logResult(message, status, reason = '', queueName) {
    const clonedMessage = JSON.parse(JSON.stringify(message));
    if (typeof clonedMessage.Body === 'string') {
        clonedMessage.Body = JSON.parse(clonedMessage.Body);
    }
    if (status === 'error') {
        let failureType = "Unknown Check";
        if (reason.toLowerCase().includes("s3 check")) {
            failureType = "S3 Check";
        } else if (reason.toLowerCase().includes("document creation request")) {
            failureType = "Document Creation Request Check";
        } else if (reason.toLowerCase().includes("document state")) {
            failureType = "Document State Check";
        } else if (reason.toLowerCase().includes("timeline")) {
            failureType = "Timeline Check";
        } else if (reason.toLowerCase().includes("filekey")) {
            failureType = "Validation Check";
        }
        clonedMessage.dlqCheckFailure = failureType;
        clonedMessage.dlqCheckFailureReason = reason;
        appendJsonToFile(needFurtherAnalysisFilename, clonedMessage);
    } else {
        appendJsonToFile(safeToDeleteFilename, clonedMessage);
    }
}

function appendJsonToFile(fileName, data) {
        appendFileSync(fileName, JSON.stringify(data) + "\n");
}

async function getAccountId(awsClient) {
        const identity = (await awsClient._getCallerIdentity());
        return identity.Account;
}

function processSQSDump(dumpFilePath, queueName) {
    try {
        const dumpContent = readFileSync(dumpFilePath, 'utf-8');
        const messages = JSON.parse(dumpContent);

        console.log(`Processing ${messages.length} messages from dump file`);

        return messages.map(message => {
            try {
                let fileKey, eventName;
                const body = JSON.parse(message.Body);

                switch(queueName) {
                    case 'pn-safestore_to_deliverypush-DLQ':
                        fileKey = body.key;
                        break;
                    case 'pn-ss-transformation-sign-and-timemark-queue-DLQ':
                        fileKey = body.fileKey;
                        break;
                    case 'pn-ss-staging-bucket-events-queue-DLQ':
                        fileKey = body?.Records?.[0]?.s3?.object?.key ||
                                  body?.detail?.object?.key;
                        break;
                    case 'pn-ss-main-bucket-events-queue-DLQ':
                        fileKey = body?.Records?.[0]?.s3?.object?.key ||
                                  body?.detail?.object?.key;
                        eventName = body?.Records?.[0]?.eventName ||
                                    body?.detail?.eventName;
                        if (!eventName) {
                            console.warn('Missing or invalid eventName in message:', message.MessageId);
                            return null;
                        }
                        break;
                    default:
                        fileKey = body?.Records?.[0]?.s3?.object?.key ||
                                  body?.detail?.object?.key;
                }

                if (!fileKey) {
                    console.warn('Missing or invalid fileKey in message:', message.MessageId);
                    return null;
                }

                if (queueName === 'pn-ss-main-bucket-events-queue-DLQ') {
                    return {
                        ...message,
                        parsedFileKey: fileKey,
                        parsedEventName: eventName
                    };
                } else {
                    return {
                        ...message,
                        parsedFileKey: fileKey
                    };
                }
            } catch (err) {
                console.warn('Error parsing message:', err);
                return null;
            }
        }).filter(Boolean);

    } catch (error) {
        console.error('Error reading/parsing dump file:', error);
        process.exit(1);
    }
}

async function checkS3Objects(awsClient, fileKey, accountId, queueName, eventName) {
    const mainBucket = `pn-safestorage-eu-south-1-${accountId}`;
    const stagingBucket = `pn-safestorage-staging-eu-south-1-${accountId}`;

    try {
        await awsClient._s3Client.send(new HeadObjectCommand({
            Bucket: stagingBucket,
            Key: fileKey
        }));
        return { success: false, reason: 'Object still exists in staging bucket' };
    } catch (e) {
    }

    if (queueName === 'pn-ss-main-bucket-events-queue-DLQ') {
        try {
            const listCmd = new ListObjectVersionsCommand({
                Bucket: mainBucket,
                Prefix: fileKey
            });
            const result = await awsClient._s3Client.send(listCmd);
            const deleteMarkers = result.DeleteMarkers || [];
            const hasDeleteMarker = deleteMarkers.some(dm => dm.Key === fileKey);

            if (eventName === 'ObjectCreated:Put') {
                if (hasDeleteMarker) {
                    return { success: false, reason: 'Delete marker exists for ObjectCreated:Put event' };
                }
                return { success: true };
            } else if (eventName === 'ObjectRemoved:DeleteMarkerCreated') {
                if (hasDeleteMarker) {
                    return { success: true };
                }
                return { success: false, reason: 'Delete marker missing for ObjectRemoved:DeleteMarkerCreated event' };
            } else {
                return { success: false, reason: `Unsupported eventName: ${eventName}` };
            }
        } catch (e) {
            return { success: false, reason: `S3 ListObjectVersions error: ${e.message}` };
        }
    } else {
        try {
            await awsClient._s3Client.send(new HeadObjectCommand({
                Bucket: mainBucket,
                Key: fileKey
            }));
            return { success: true };
        } catch (e) {
            return { success: false, reason: 'Object not found in main bucket' };
        }
    }
}

async function checkDocumentState(awsClient, fileKey, queueConfig, queueName, eventName) {
    if (!fileKey || typeof fileKey !== 'string') {
        console.error('Invalid fileKey:', fileKey);
        return false;
    }

    try {
        const command = new GetItemCommand({
            TableName: queueConfig.documentConfig.tableName,
            Key: {
                documentKey: { S: fileKey }
            }
        });

        const result = await awsClient._dynamoClient.send(command);

        if (!result?.Item) {
            return false;
        }

        const item = unmarshall(result.Item);
        const documentType = item.documentType?.tipoDocumento;

        if (!documentType) {
            return false;
        }

        let expectedLogicalState = null;
        if (queueConfig.documentConfig.ATTACHED_TYPES?.includes(documentType)) {
            expectedLogicalState = 'ATTACHED';
        } else if (queueConfig.documentConfig.SAVED_TYPES?.includes(documentType)) {
            expectedLogicalState = 'SAVED';
        }

        let logicalStateOk = item.documentLogicalState === expectedLogicalState;

        if (queueName === 'pn-ss-main-bucket-events-queue-DLQ') {
            let documentStateOk = false;
            if (eventName === 'ObjectCreated:Put') {
                documentStateOk = item.documentState === 'attached';
            } else if (eventName === 'ObjectRemoved:DeleteMarkerCreated') {
                documentStateOk = item.documentState === 'deleted';
            } else {
                documentStateOk = false;
            }
            return {
                success: logicalStateOk && documentStateOk,
                documentType,
                actualState: item.documentLogicalState,
                expectedLogicalState,
                actualDocumentState: item.documentState,
                expectedDocumentState: eventName === 'ObjectCreated:Put' ? 'attached' : (eventName === 'ObjectRemoved:DeleteMarkerCreated' ? 'deleted' : undefined)
            };
        } else {
            return {
                success: logicalStateOk,
                documentType,
                actualState: item.documentLogicalState,
                expectedLogicalState
            };
        }
    } catch (error) {
        console.error('DynamoDB GetItem error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function checkDocumentCreationRequest(awsClient, fileKey) {
        if (!fileKey || typeof fileKey !== 'string') {
                console.error('Invalid fileKey:', fileKey);
                return false;
        }
    
        try {
                const docRequest = await awsClient._queryRequest(
                        'pn-DocumentCreationRequestTable',
                        'key',
                        `safestorage://${fileKey}`
                );
    
                return {
                        success: docRequest?.Items?.length > 0
                };
        } catch (error) {
                console.error('DocumentCreationRequest check error:', error);
                return {
                        success: false,
                        error: error.message
                };
        }
}

async function checkTimeline(awsClient, fileKey) {
        if (!fileKey || typeof fileKey !== 'string') {
                console.error('Invalid fileKey:', fileKey);
                return false;
        }
    
        try {
                const docRequest = await awsClient._queryRequest(
                        'pn-DocumentCreationRequestTable',
                        'key',
                        `safestorage://${fileKey}`
                );
    
                if (!docRequest?.Items?.[0]) {
                        return false;
                }
    
                const request = unmarshall(docRequest.Items[0]);
                if (!request?.iun || !request?.timelineId) {
                        return false;
                }
    
                const { iun, timelineId } = request;
    
                const allTimelineItems = await awsClient._queryRequest(
                        'pn-Timelines',
                        'iun',
                        iun
                );
    
                const sortedItems = allTimelineItems.Items
                        .map(item => unmarshall(item))
                        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
                const itemToCheck = sortedItems.find(item => item.timelineElementId === timelineId);
    
                if (!itemToCheck) {
                        return false;
                }
    
                return itemToCheck.timestamp < sortedItems[0].timestamp;
    
        } catch (error) {
                console.error('Timeline check error:', error);
                return false;
        }
}

async function main() {
        const args = validateArgs();
        const { envName, dumpFile, queueName } = args.values;
        const queueConfig = QUEUE_CONFIGS[queueName];
    
        const stats = {
                total: 0,
                passed: 0,
                s3Failed: 0,
                stateCheckFailed: 0,
                timelineFailed: 0
        };
    
        if (queueName === 'pn-safestore_to_deliverypush-DLQ') {
                stats.docCreationRequestFailed = 0;
        }
    
        const confinfoClient = new AwsClientsWrapper('confinfo', envName);
        const coreClient = new AwsClientsWrapper('core', envName);
       
        await Promise.all([
                initializeAwsClients(confinfoClient),
                initializeAwsClients(coreClient),
                new Promise(resolve => {
                        if (!existsSync('results')) mkdirSync('results');
                        resolve();
                })
        ]);
    
        const [confinfoAccountId, coreAccountId] = await Promise.all([
                getAccountId(confinfoClient),
                getAccountId(coreClient)
        ]);
    
        const finalTimestamp = new Date().toISOString().replace(/:/g, '-').replace('.', '-');
        safeToDeleteFilename = `results/safe_to_delete_${queueName}_${finalTimestamp}.json`;
        needFurtherAnalysisFilename = `results/need_further_analysis_${queueName}_${finalTimestamp}.json`;
    
        const messages = processSQSDump(dumpFile, queueName);
        stats.total = messages.length;
    
        console.log(`\nStarting validation checks for ${stats.total} messages...`);
        let progress = 0;
    
        for (const message of messages) {
                progress++;
                process.stdout.write(`\rChecking fileKey ${progress} of ${stats.total}`);
    
                const fileKey = message.parsedFileKey;
                const eventName = message.parsedEventName;

                if (!fileKey) {
                        logResult(message, 'error', 'Missing or invalid fileKey in message');
                        continue;
                }
    
                if (queueName === 'pn-safestore_to_deliverypush-DLQ') {
                        const docCreationCheck = await checkDocumentCreationRequest(coreClient, fileKey);
                        if (!docCreationCheck.success) {
                                stats.passed++;
                                logResult(message, 'ok', '', queueName);
                        } else {
                                stats.docCreationRequestFailed++;
                                logResult(message, 'error', 'Document creation request found', queueName);
                        }
                        continue;
                }
    
                if (queueConfig.requireS3Check) {
                        const s3Check = await checkS3Objects(
                                confinfoClient,
                                fileKey,
                                confinfoAccountId,
                                queueName,
                                eventName
                        );
                        if (!s3Check.success) {
                                logResult(message, 'error', `S3 check failed: ${s3Check.reason}`, queueName);
                                stats.s3Failed++;
                                continue;
                        }
                }
    
                let documentType;
                if (queueConfig.requireDocumentStateCheck) {
                        const docStateCheck = await checkDocumentState(
                                confinfoClient,
                                fileKey,
                                queueConfig,
                                queueName,
                                eventName
                        );
                        if (!docStateCheck.success) {
                                let reason;
                                if (queueName === 'pn-ss-main-bucket-events-queue-DLQ') {
                                        reason = docStateCheck.error ||
                                            `Document state check failed: found logicalState '${docStateCheck.actualState}' (expected '${docStateCheck.expectedLogicalState}'), documentState '${docStateCheck.actualDocumentState}' (expected '${docStateCheck.expectedDocumentState}') for type '${docStateCheck.documentType}'`;
                                } else {
                                        reason = docStateCheck.error ||
                                            `Document state check failed: found '${docStateCheck.actualState}' but expected '${docStateCheck.expectedLogicalState}' for type '${docStateCheck.documentType}'`;
                                }
                                logResult(message, 'error', reason, queueName);
                                stats.stateCheckFailed++;
                                continue;
                        }
                        documentType = docStateCheck.documentType;
                }
    
                if (queueConfig.requireTimelineCheck &&
                        (!queueConfig.requireDocumentStateCheck ||
                         queueConfig.documentConfig.timelineCheckTypes.includes(documentType))) {
                        const timelineCheck = await checkTimeline(coreClient, fileKey);
                        if (!timelineCheck) {
                                logResult(message, 'error', 'Timeline check failed', queueName);
                                stats.timelineFailed++;
                                continue;
                        }
                }
    
                stats.passed++;
                logResult(message, 'ok', '', queueName);
        }
    
        process.stdout.write('\n');
        printSummary(stats, queueName);
}
    
main().catch(console.error);
