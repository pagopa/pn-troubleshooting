const { SQSClient, GetQueueUrlCommand, GetQueueAttributesCommand } = require("@aws-sdk/client-sqs");
const AWS = require('aws-sdk');

class QueueUtils {
  constructor(awsRegion) {
    this.client = new SQSClient({ region: awsRegion });
    this.sqs = new AWS.SQS({ region: awsRegion });
  }

  // Funzione per ottenere il numero di messaggi nella coda
  async getQueueLength(queueUrl) {
    const params = {
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages']
    };

    const command = new GetQueueAttributesCommand(params);
    const data = await this.client.send(command);
    return parseInt(data.Attributes.ApproximateNumberOfMessages, 10);
  }

  // Funzione per aspettare che le code si svuotino
  async waitForQueuesToEmpty(queueUrls) {
    console.log(`Checking if the queues are empty...`);
    
    let allQueuesEmpty = false;

    while (!allQueuesEmpty) {
      allQueuesEmpty = true;
      
      for (const url of queueUrls) {
        const queueLength = await this.getQueueLength(url);
        if (queueLength > 0) {
          allQueuesEmpty = false;
          console.log(`Queue ${url} is not empty. Waiting...`);
          await new Promise(resolve => setTimeout(resolve, 10000)); // Aspetta 10 secondi prima di ricontrollare
          break; 
        }
      }
    }

    console.log(`All queues are empty. Proceeding with the process...`);
  }

  async getQueueUrls(queueNames) {
    let queueUrls = [];

    for (const name of queueNames) {
      const input = {
        QueueName: name
      };

      try {
        const data = await this.client.send(new GetQueueUrlCommand(input));
        console.log(`Queue URL for ${name}: ${data.QueueUrl}`);
        queueUrls.push(data.QueueUrl);
      } catch (err) {
        console.log(`Error for queue ${name}: ${err}`);
        // Gestisci l'errore in base alle tue esigenze
      }
    }

    if (queueUrls.length > 0) {
      await this.waitForQueuesToEmpty(queueUrls);
    }
  }
}

module.exports = QueueUtils;
