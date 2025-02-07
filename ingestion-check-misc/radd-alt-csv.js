const AWS = require('aws-sdk');
const { createObjectCsvWriter } = require('csv-writer');
const { format } = require('date-fns'); // Per formattare la data

// Configura AWS SDK
// const credentials = new AWS.SharedIniFileCredentials({ profile: 'uat_Full' });
const credentials = new AWS.SharedIniFileCredentials({ profile: 'prod_ROA' });

AWS.config.credentials = credentials;
AWS.config.update({ region: 'eu-south-1' });

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const operationType = 'ACT';
// Definizione della query

const excludedRecipientIds = ['PF-5024cd5b-4516-499c-97b6-0069bc882589', 'PF-afdfcac9-d954-44f9-9c6f-b37c13dde9ba', 'PG-9bd89873-1bfa-41b2-8956-3d8e68f4eb36', 'PF-d704d752-2b3d-4b6a-872c-e962440135b3'];

const excludeMisteryIUN = ['WQZM-ZMEZ-TZRY-202412-L-1', 'EGHR-PXWN-AXTJ-202412-Q-1', 'TQJT-YKHV-JKJP-202412-U-1']

const recExpression = excludedRecipientIds.map((_, index) => `recipientId <> :excludedRecipientId${index}`
).join(' AND ');

console.log(recExpression);

const iunExpression = excludeMisteryIUN.map((_, index) =>
    `iun <> :excludeMisteryIUN${index}`
).join(' AND ');

console.log(iunExpression);

const filterExpression = `(${recExpression} AND ${iunExpression})`;

const exprAttrValues = {
    ...excludedRecipientIds.reduce((acc, value, index) => {
        acc[`:excludedRecipientId${index}`] = value;
        return acc;
    }, {}),
    ...excludeMisteryIUN.reduce((acc, value, index) => {
        acc[`:excludeMisteryIUN${index}`] = value;
        return acc;
    }, {})
};


let params = {
    TableName: 'pn-radd-transaction-alt',
    FilterExpression: filterExpression,
    ExpressionAttributeValues: exprAttrValues
};


// Ottenere la data corrente e formattarla
const currentDate = format(new Date(), 'yyyy-MM-dd_HH-mm-ss'); // Es. '2024-11-18_14-30-00'
const outputPath = `output_${currentDate}.csv`;

async function extractRaddAlt(params) {
    let data = [];
    let lastEvaluatedKey = null;
    // Esegui la query
    do {
        const result = await dynamoDB.scan(params).promise();
        data = data.concat(result.Items);

        lastEvaluatedKey = result.LastEvaluatedKey; // Handle pagination
        params.ExclusiveStartKey = lastEvaluatedKey;
    } while (lastEvaluatedKey)

    return data;
}



async function writeCsv() {

    const data = await extractRaddAlt(params);

    const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: [{ id: "transactionId", title: "transactionId" },
        { id: "operationType", title: "operationType" },
        { id: "delegateId", title: "delegateId" },
        { id: "errorReason", title: "errorReason" },
        { id: "iun", title: "iun" },
        { id: "operationEndDate", title: "operationEndDate" },
        { id: "operationId", title: "operationId" },
        { id: "operationStartDate", title: "operationStartDate" },
        { id: "operation_status", title: "operation_status" },
        { id: "recipientId", title: "recipientId" },
        { id: "recipientType", title: "recipientType" }
        ]
    });
    
    // header: Object.keys(data.Items[0]).map(key => ({ id: key, title: key }))
    // Scrivi i dati nel CSV
    csvWriter.writeRecords(data)
        .then(() => {
            console.log('File CSV salvato con successo.');
        })
        .catch((error) => {
            console.error('Errore durante la scrittura del CSV:', error);
        });
}

writeCsv().catch(console.error);



// dynamoDB.scan(params, (err, data) => {
//     if (err) {
//         console.error('Errore nella query:', JSON.stringify(err, null, 2));
//     } else {
//         console.log('Scan eseguita con successo');

//         // Configurazione per il file CSV
//         const csvWriter = createObjectCsvWriter({
//             path: outputPath,
//             header: [{ id: "transactionId", title: "transactionId" },
//             { id: "operationType", title: "operationType" },
//             { id: "delegateId", title: "delegateId" },
//             { id: "errorReason", title: "errorReason" },
//             { id: "iun", title: "iun" },
//             { id: "operationEndDate", title: "operationEndDate" },
//             { id: "operationId", title: "operationId" },
//             { id: "operationStartDate", title: "operationStartDate" },
//             { id: "operation_status", title: "operation_status" },
//             { id: "recipientId", title: "recipientId" },
//             { id: "recipientType", title: "recipientType" }
//             ]
//         });

//         // header: Object.keys(data.Items[0]).map(key => ({ id: key, title: key }))
//         // Scrivi i dati nel CSV
//         csvWriter.writeRecords(data.Items)
//             .then(() => {
//                 console.log('File CSV salvato con successo.');
//             })
//             .catch((error) => {
//                 console.error('Errore durante la scrittura del CSV:', error);
//             });
//     }
// });
