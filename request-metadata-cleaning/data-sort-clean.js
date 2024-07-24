const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { fromSSO } = require("@aws-sdk/credential-provider-sso");
const fs = require('fs');
const { parseArgs } = require('util');
const process = require('node:process');

class DynamoDBScanner {
  constructor(params) {
    this.tableName = params.tableName || 'pn-EcRichiesteMetadati';
    this.region = params.region || 'eu-south-1';
    this.scanLimit = params.scanLimit ? parseInt(params.scanLimit, 10) : undefined;
    this.outputFilePath1 = 'output_requestId-missing-insertTimestamp.txt';
    this.outputFilePath2 = 'output_requestId-statusDateTime_disorder.txt';

    this.awsProfile = params.awsProfile;
    this.dryrun = params.dryrun || false;
    this.test = params.test || false;

    this.credentials = this.awsProfile ? fromSSO({ profile: this.awsProfile })() : undefined;

    this.dynamoDbClient = new DynamoDBClient({
      credentials: this.credentials,
      region: this.region,
    });

    this.dynamoDbDocumentClient = DynamoDBDocumentClient.from(this.dynamoDbClient);

    this.fileStream1 = this.createFileStream(this.outputFilePath1);
    this.fileStream2 = this.createFileStream(this.outputFilePath2);
  }

  createFileStream(filePath) {
    const fileStream = fs.createWriteStream(filePath, { flags: 'a' });
    fileStream.on('error', (err) => {
      console.error(`Errore durante la scrittura su ${filePath}: ${err}`);
    });
    return fileStream;
  }

  async scanTable(params, processItem) {
    let lastEvaluatedKey = null;
    let scannedCount = 0;
    let isScanning = true;

    while (isScanning) {
      try {
        const data = await this.dynamoDbDocumentClient.send(new ScanCommand(params));
        const newItems = data.Items || [];

        console.log(`Scanned ${data.ScannedCount} items`);

        newItems.forEach(item => processItem(item));

        scannedCount += newItems.length;

        if (this.scanLimit && scannedCount >= this.scanLimit) {
          console.log('Limite di scansione raggiunto.');
          isScanning = false;
        }

        lastEvaluatedKey = data.LastEvaluatedKey;
        if (lastEvaluatedKey) {
          params.ExclusiveStartKey = lastEvaluatedKey;
        } else {
          console.log('Nessun LastEvaluatedKey, terminando la scansione.');
          isScanning = false;
        }
      } catch (err) {
        console.error('Errore durante la scansione della tabella:', err);
        isScanning = false;
      }
    }
  }

  async scanAndProcessItems() {
    const params = {
      TableName: this.tableName,
      ProjectionExpression: "requestId, eventsList",
      FilterExpression: "attribute_exists(eventsList) AND attribute_exists(eventsList[0].paperProgrStatus) AND attribute_type(eventsList[0].paperProgrStatus, :nullType)",
        ExpressionAttributeValues: {
            ":nullType": "NULL"
        },
      Limit: this.scanLimit,
    };

    const processItem = item => {
      const requestId = item.requestId;
      const eventsList = item.eventsList || [];
      let statusDateTimes = [];
      let missingInsertTimestamp = false;

      eventsList.forEach(event => {
        if (event.paperProgrStatus && typeof event.paperProgrStatus === 'object') {
          const status = event.paperProgrStatus;
          if (status && status.statusDateTime) {
            const date = new Date(status.statusDateTime);
            statusDateTimes.push(date);
          }
        }

        if (!event.insertTimestamp) {
          missingInsertTimestamp = true;
        }
      });

      if (!this.isInChronologicalOrder(statusDateTimes)) {
        const outputLine = `${requestId}\n`;
        this.fileStream2.write(outputLine);
      }

      if (missingInsertTimestamp) {
        const outputLine = `${requestId}\n`;
        this.fileStream1.write(outputLine);
      }
    };

    await this.scanTable(params, processItem);
  }

  isInChronologicalOrder(dates) {
    for (let i = 1; i < dates.length; i++) {
      if (dates[i] < dates[i - 1]) {
        return false;
      }
    }
    return true;
  }

  async run() {
    try {
      await this.scanAndProcessItems();
      console.log('File di output generati.');
    } catch (error) {
      console.error(`Errore nel processo: ${error}`);
    } finally {
      this.closeFileStreams();
    }
  }

  closeFileStreams() {
    this.fileStream1.end();

    this.fileStream2.end();
  }
}

const args = parseArgs({
  options: {
    awsProfile: { type: "string" },
    scanLimit: { type: "string" },
    test: { type: "boolean" },
    dryrun: { type: "boolean" },
    tableName: { type: "string" },
    region: { type: "string" }
  },
});

const scanner = new DynamoDBScanner(args.values);

scanner.run()
  .then(() => console.log('Processo completato con successo.'))
  .catch(error => console.error(`Errore nel processo: ${error}`));

// Handling of signals coming from the process.
function handleProcessSignal(signal) {
  console.log(`Received ${signal} signal. Ending script execution.`);
  process.exit();
}

process.on('SIGINT', handleProcessSignal);
process.on('SIGTERM', handleProcessSignal);
process.on('SIGHUP', handleProcessSignal);
