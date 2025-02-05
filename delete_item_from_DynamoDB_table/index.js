const { AwsClientsWrapper } = require("pn-common");

async function retrievePkAndSk(client, table){
    const describeTable = await client._describeTable(table);
    let PK;
    let SK;

    for(const item of describeTable.Table.KeySchema) {
        if(item.KeyType === "HASH") PK = item.AttributeName;
        if(item.KeyType === "RANGE") SK = item.AttributeName;
    };
    return {
        PK: PK,
        SK: SK
    };
};

async function main() {
    const tableName = "pn-Timelines";
    const env = "test";
    const accountType = "core";

    const clientDB = new AwsClientsWrapper(accountType, env);
    clientDB._initDynamoDB();
    const keys = await retrievePkAndSk(clientDB, tableName);
    console.log(keys);
};

main();
