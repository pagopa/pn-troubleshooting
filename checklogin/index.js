const { AwsClientsWrapper } = require("pn-common");

const account_type = "core";
const env = "test";

// Inizializzazione client AWS
async function main() {
const ecsClient = new AwsClientsWrapper(account_type,env);
ecsClient._initECS();

const result = await ecsClient._listClusters();
console.log(result);
}

main()
