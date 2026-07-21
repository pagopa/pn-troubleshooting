import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

async function scanAll(client, input, resourceLabel) {
    const items = [];
    let exclusiveStartKey;
    let pageNumber = 0;

    do {
        const response = await client.send(new ScanCommand({
            ...input,
            ExclusiveStartKey: exclusiveStartKey,
        }));
        items.push(...(response.Items || []));
        exclusiveStartKey = response.LastEvaluatedKey;
        pageNumber += 1;
        console.log(`DynamoDB scan ${resourceLabel}: pagina ${pageNumber}, elementi accumulati ${items.length}`);
    } while (exclusiveStartKey);

    return items;
}

export async function getOnboardInstitutions({
    client = new DynamoDBClient({}),
    tableName = process.env.ONBOARD_INSTITUTIONS_TABLE || 'pn-OnboardInstitutions',
} = {}) {
    const items = await scanAll(client, {
        TableName: tableName,
        ProjectionExpression: '#id, #description, #ipaCode',
        ExpressionAttributeNames: {
            '#id': 'id',
            '#description': 'description',
            '#ipaCode': 'ipaCode',
        },
    }, 'enti');

    return items.map(item => ({
        id: item.id?.S,
        description: item.description?.S,
        ipaCode: item.ipaCode?.S,
    })).filter(item => item.id && item.ipaCode);
}

export async function getEnabledPdndApiKeys({
    client = new DynamoDBClient({}),
    tableName = process.env.API_KEYS_TABLE || 'pn-apiKey',
} = {}) {
    const items = await scanAll(client, {
        TableName: tableName,
        FilterExpression: '#status = :enabled AND #pdnd = :true',
        ProjectionExpression: '#id, #paId, #pdnd',
        ExpressionAttributeNames: {
            '#id': 'id',
            '#paId': 'x-pagopa-pn-cx-id',
            '#pdnd': 'pdnd',
            '#status': 'status',
        },
        ExpressionAttributeValues: {
            ':enabled': { S: 'ENABLED' },
            ':true': { BOOL: true },
        },
    }, 'API key');

    return items.map(item => ({
        id: item.id?.S,
        paId: item['x-pagopa-pn-cx-id']?.S,
        pdnd: item.pdnd?.BOOL,
    })).filter(item => item.id && item.paId && item.pdnd === true);
}
