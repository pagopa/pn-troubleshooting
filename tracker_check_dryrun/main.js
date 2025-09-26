import {
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { fromSSO } from "@aws-sdk/credential-provider-sso";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import fs from "fs";

const dynamoClient = new DynamoDBClient({
  region: "eu-south-1",
  credentials: fromSSO({ profile: "sso_pn-core-dev" }),
});

async function fetchTimeline(iun) {
  try {
    const command = new QueryCommand({
      TableName: "pn-Timelines",
      KeyConditionExpression: "iun = :iun",
      ExpressionAttributeValues: {
        ":iun": { S: iun },
      },
    });

    const response = await dynamoClient.send(command);
    console.log(`✅ Query eseguita pn-Timelines. Trovati ${response.Count} elementi.`);

    // Unmarshall e filtra gli eventi
    return (response.Items || [])
      .map((item) => unmarshall(item))
      .filter(
        (item) =>
          item.category === "SEND_ANALOG_PROGRESS" ||
          item.category === "SEND_ANALOG_FEEDBACK"
      );
  } catch (err) {
    console.error("❌ Errore nella query:", err);
  }
}

async function fetchDryRunOutputs(attemptId) {
    let response = [];
    let index = 0;
    do{
        try {
            const trackingId = `${attemptId}.PCRETRY_${index}`;
            console.log(trackingId);
            const command = new QueryCommand({
                TableName: "pn-PaperTrackerDryRunOutputs",
                KeyConditionExpression: "trackingId = :trackingId",
                ExpressionAttributeValues: {
                    ":trackingId": { S: trackingId },
                },
            });

            response = await dynamoClient.send(command);
            console.log(`✅ Query eseguita pn-PaperTrackerDryRunOutputs. Trovati ${response.Count} elementi.`);

            return (response.Items || [])
                .map((item) => unmarshall(item));
        } catch (err) {
            console.error("❌ Errore nella query:", err);
        }
        index++;
    } while(response.length > 0);
}

function getSendRequestId(items) {
    const out = {};
    items.forEach(item => {
        out[item.details.sendRequestId] = true;
    });
    return Object.keys(out);
}

async function main(iun) {
    // Esegui esempio
    const timelineElements = await fetchTimeline(iun);
    const attempts = getSendRequestId(timelineElements)
                        .map(attemptId => attemptId.replaceAll("SEND_ANALOG_DOMICILE","PREPARE_ANALOG_DOMICILE"));

    const dryRunElements = [];
    for (const attemptId of attempts) {
        const outputs = await fetchDryRunOutputs(attemptId);
        console.log(outputs);
        dryRunElements.push(...outputs);
    }

    fs.writeFileSync(`timeline_${iun}.json`, JSON.stringify(timelineElements, null, 2), "utf-8");
    fs.writeFileSync(`dryrun_${iun}.json`, JSON.stringify(dryRunElements, null, 2), "utf-8");

    console.log(`✅ Files salvati`);
}

const IUN = "NTHY-WDKV-WAGD-202509-R-1";

main(IUN);