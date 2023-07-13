const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { S3Client, ListObjectsCommand } = require("@aws-sdk/client-s3");
const {
  DynamoDBClient,
  ScanCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
} = require("@aws-sdk/client-dynamodb");

function awsClientCfg(env, account) {
  const self = this;
  return {
    region: "eu-south-1",
    credentials: fromIni({
      profile: `sso_pn-${account}-${env}`,
    }),
  };
}

async function sleep(ms) {
  return new Promise((accept, reject) => {
    setTimeout(() => accept(null), ms);
  });
}

class AwsClientsWrapper {
  // FIXME parametri profilo e regione
  constructor(env /* dev, test, uat, prod */) {
    this._s3Client = new S3Client(awsClientCfg(env, "confinfo"));
    this._dynamoClient = new DynamoDBClient(awsClientCfg(env, "core"));
  }

  async failingNotificationsFromProgressionSensor() {
    let input = {
      TableName: "pn-ProgressionSensorData",
      IndexName: "activeViolations-index",
      KeyConditionExpression: "#t = :t",
      ExpressionAttributeNames: { "#t": "active_sla_entityName_type" },
      ExpressionAttributeValues: { ":t": { S: "VALIDATION" } },
    };

    let items = [];

    do {
      let response = await this._dynamoClient.send(new QueryCommand(input));

      items = items.concat(response.Items);

      if (response.LastEvaluatedKey) {
        input.ExclusiveStartKey = response.LastEvaluatedKey;
      }
    } while (input.ExclusiveStartKey);

    return items;
  }

  async failingNotificationPage() {
    let input = {
      TableName: "pn-FutureAction",
      Limit: 10 * 1000,
      FilterExpression: "#t = :t",
      ExpressionAttributeNames: { "#t": "type" },
      ExpressionAttributeValues: { ":t": { S: "NOTIFICATION_VALIDATION" } },
    };

    let response = await this._dynamoClient.send(new ScanCommand(input));

    return response.Items;
  }

  async getNotification(iun) {
    let input = {
      TableName: "pn-Notifications",
      Key: { iun: { S: iun } },
    };

    let response = await this._dynamoClient.send(new GetItemCommand(input));

    return response.Item;
  }

  async checkS3Exists(bucket, prefix) {
    let input = {
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1,
    };

    let response = await this._s3Client.send(new ListObjectsCommand(input));

    return response.Contents?.length > 0;
  }

  async putRefusingTimeline(iun, recipients, fileKey, sentAt, paId) {
    const timestamp = new Date().toISOString();

    let input = {
      TableName: "pn-Timelines",
      Item: {
        iun: {
          S: iun,
        },
        timelineElementId: {
          S: `REQUEST_REFUSED.IUN_${iun}`,
        },
        category: {
          S: "REQUEST_REFUSED",
        },
        details: {
          M: {
            nextSourceAttemptsMade: {
              N: "0",
            },
            notificationCost: {
              N: `${recipients * 100}`,
            },
            numberOfRecipients: {
              N: `${recipients}`,
            },
            refusalReasons: {
              L: [
                {
                  M: {
                    detail: {
                      S: "Allegato non trovato. fileKey=" + fileKey,
                    },
                    errorCode: {
                      S: "FILE_NOTFOUND",
                    },
                  },
                },
              ],
            },
          },
        },
        legalFactId: {
          L: [],
        },
        notificationSentAt: {
          S: sentAt,
        },
        paId: {
          S: paId,
        },
        statusInfo: {
          M: {
            actual: {
              S: "REFUSED",
            },
            statusChanged: {
              BOOL: true,
            },
            statusChangeTimestamp: {
              S: timestamp,
            },
          },
        },
        timestamp: {
          S: timestamp,
        },
      },
    };

    let response = await this._dynamoClient.send(new PutItemCommand(input));

    return response;
  }

  async removeFutureActions(iun) {
    let queryInput = {
      TableName: "pn-FutureAction",
      IndexName: "iun-index",
      Select: "SPECIFIC_ATTRIBUTES",
      ProjectionExpression: "actionId,timeSlot",
      Limit: 1000,
      KeyConditionExpression: "iun = :i",
      ExpressionAttributeValues: { ":i": { S: iun } },
    };

    let queryResponse = await this._dynamoClient.send(
      new QueryCommand(queryInput)
    );
    let futureActions = queryResponse.Items;

    for (let i = 0; i < futureActions.length; i++) {
      let futureAction = futureActions[i];

      let deleteItemInput = {
        TableName: "pn-FutureAction",
        Key: futureAction,
      };
      await this._dynamoClient.send(new DeleteItemCommand(deleteItemInput));
    }
  }

  async logFutureActions(iun) {
    let queryInput = {
      TableName: "pn-FutureAction",
      IndexName: "iun-index",
      Select: "SPECIFIC_ATTRIBUTES",
      ProjectionExpression: "actionId,timeSlot",
      Limit: 1000,
      KeyConditionExpression: "iun = :i",
      ExpressionAttributeValues: { ":i": { S: iun } },
    };

    let queryResponse = await this._dynamoClient.send(
      new QueryCommand(queryInput)
    );
    let futureActions = queryResponse.Items;

    for (const futureAction of futureActions) {
      console.log("    FutureAction found: ", JSON.stringify(futureAction));
    }
  }
}

exports.AwsClientsWrapper = AwsClientsWrapper;
