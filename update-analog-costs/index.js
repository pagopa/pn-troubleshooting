import { parse } from 'csv-parse/sync';
import fs from 'fs';
import axios from 'axios';
import { parseArgs } from 'util';
import { AwsClientsWrapper } from "pn-common";

const REQUIRED_COLUMNS = [
  'IUN', 'timelineElementId', 'category', 'costo timelineElementId',
  'vat', 'recipientIndex', 'noticeCode', 'creditorTaxId',
  'eventTimestamp', 'notificationFeePolicy', 'paFee'
];

const INSTANCE_MAP = {
  test: 'i-0c7b5a5e1e47dcdff',
  uat: 'i-08a957490340bdeb2',
  hotfix: 'i-00fce6a84f7536813',
  prod: 'i-08d32e04a6fbbcb77'
};

const HOST_MAP = {
  test: 'internal-EcsA-20230504103152508600000011-1839177861.eu-south-1.elb.amazonaws.com',
  uat: 'internal-EcsA-20230508132226979200000016-2130814132.eu-south-1.elb.amazonaws.com',
  hotfix: 'internal-EcsA-20230707140125848600000001-1120454561.eu-south-1.elb.amazonaws.com',
  prod: 'internal-EcsA-20230522152202180500000011-96161141.eu-south-1.elb.amazonaws.com'
};

const API_CATEGORIES = ['VALIDATION', 'REQUEST_REFUSED', 'NOTIFICATION_CANCELLED'];
const SQS_CATEGORIES = ['SEND_ANALOG_DOMICILE_ATTEMPT_0', 'SEND_ANALOG_DOMICILE_ATTEMPT_1', 'SEND_SIMPLE_REGISTERED_LETTER'];

/**
 * Validates command line arguments
 * @returns {Object} Parsed and validated arguments
 */
function validateArgs() {
    const usage = `
Usage: node index.js --envName|-e <environment> --csvFile|-f <path>

Description:
    Updates analog notification costs through API calls and SQS messages.

Parameters:
    --envName, -e     Required. Environment to update (test|uat|hotfix|prod)
    --csvFile, -f     Required. Path to the CSV file containing notification data
    --help, -h        Display this help message`;

    const args = parseArgs({
        options: {
            envName: { type: "string", short: "e" },
            csvFile: { type: "string", short: "f" },
            help: { type: "boolean", short: "h" }
        },
        strict: true
    });

    if (args.values.help) {
        console.log(usage);
        process.exit(0);
    }

    if (!args.values.envName || !args.values.csvFile) {
        console.error("Error: Missing required parameters");
        console.log(usage);
        process.exit(1);
    }

    if (!INSTANCE_MAP[args.values.envName]) {
        console.error(`Error: Invalid environment. Must be one of: ${Object.keys(INSTANCE_MAP).join(', ')}`);
        process.exit(1);
    }

    return args.values;
}

/**
 * Validates and parses the input CSV file
 * @param {string} filePath - Path to CSV file
 * @returns {Array<Object>} Parsed notifications
 */
function parseCsvFile(filePath) {
    try {
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const notifications = parse(csvContent, { columns: true, skip_empty_lines: true });

        // Validate CSV structure
        const headers = Object.keys(notifications[0]);
        const missingColumns = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
        }

        return notifications;
    } catch (error) {
        console.error('Error reading/parsing CSV file:', error);
        process.exit(1);
    }
}


/**
 * Processes a single notification by handling it either as an API request or SQS message based on its category
 * @param {Object} notification - The notification to be processed containing category information
 * @param {AWS.SQS} awsClient - The AWS SQS client instance
 * @param {string} queueUrl - The URL of the SQS queue
 * @returns {Promise<void>}
 */
async function processNotification(notification, awsClient, queueUrl) {
  if (API_CATEGORIES.includes(notification.category)) {
    await handleApiRequest(notification);
  } else if (SQS_CATEGORIES.includes(notification.category)) {
    await handleSqsMessage(notification, awsClient, queueUrl);
  }
}

async function handleApiRequest(notification) {
  const payload = {
    notificationStepCost: notification['costo timelineElementId'],
    iun: notification.IUN,
    paymentsInfoForRecipients: [{
      recIndex: notification.recipientIndex,
      creditorTaxId: notification.creditorTaxId,
      noticeCode: notification.noticeCode
    }],
    eventTimestamp: notification.eventTimestamp,
    eventStorageTimestamp: notification.eventTimestamp,
    updateCostPhase: notification.category
  };

  try {
    await axios.post('http://localhost:8888/ext-registry-private/cost-update', payload);
    console.log(`API request successful for IUN ${notification.IUN}`);
  } catch (error) {
    console.error(`API request failed for IUN ${notification.IUN}:`, error.message);
  }
}

async function handleSqsMessage(notification, awsClient, queueUrl) {
  const messageAttributes = {
    iun: { DataType: 'String', StringValue: notification.IUN },
    eventType: { DataType: 'String', StringValue: 'UPDATE_COST_PHASE_EVENT' }
  };

  const messageBody = {
    iun: notification.IUN,
    recIndex: notification.recipientIndex,
    notificationStepCost: notification['costo timelineElementId'],
    vat: notification.vat,
    eventTimestamp: notification.eventTimestamp,
    eventStorageTimestamp: notification.eventTimestamp,
    updateCostPhase: notification.category
  };

  try {
    await awsClient._sendSQSMessage(queueUrl, messageBody, 0, messageAttributes);
    console.log(`SQS message sent for IUN ${notification.IUN}`);
  } catch (error) {
    console.error(`SQS send failed for IUN ${notification.IUN}:`, error.message);
  }
}

async function main() {
    const args = validateArgs();
    const { envName, csvFile } = args;

    const awsClient = new AwsClientsWrapper('core', envName);
    awsClient._initSSM();
    awsClient._initSQS();

    let sessionId;
    try {
        // Start SSM session
        sessionId = await awsClient._startSSMPortForwardingSession(
            INSTANCE_MAP[envName],
            HOST_MAP[envName],
            8080,
            8888
        );

        // Parse CSV file
        const notifications = parseCsvFile(csvFile);
        console.log(`Processing ${notifications.length} notifications...`);

        // Get SQS queue URL
        const queueUrl = await awsClient._getQueueUrl('pn-deliverypush_to_externalregistries');

        // Process notifications
        let processed = 0;
        for (const notification of notifications) {
            await processNotification(notification, awsClient, queueUrl);
            processed++;
            if (processed % 10 === 0) {
                console.log(`Processed ${processed}/${notifications.length} notifications`);
            }
        }

        console.log(`\nCompleted processing ${processed} notifications`);

    } finally {
        // Cleanup: terminate SSM session
        if (sessionId) {
            await awsClient._terminateSSMSession(sessionId);
            console.log('SSM session terminated');
        }
    }
}

main().catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
});
