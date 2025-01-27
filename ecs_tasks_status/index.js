const { ECSClient, DescribeServicesCommand, ListClustersCommand, ListServicesCommand } = require("@aws-sdk/client-ecs"); // CommonJS import
const { parseArgs } = require('util');

// Necessario "aws sso login --profile sso_pn-core-hotfix" preliminare

const args = [
  { name: "account_type", mandatory: true},
  { name: "region", mandatory: false},
  { name: "env", mandatory: true},
  { name: "cluster", mandatory: true}
];

const parsedArgs = { values: { account_type, region, env, cluster }} = parseArgs(
    { options: {
          account_type: {type: "string",short: "a"},
          region: {type: "string", short: "r", default: "eu-south-1"},
          env: {type: "string",short: "e"},
          cluster: {type: "string",short: "c"}
      }
})

// --- Definizione Funzioni ---

async function _checkingParameters(args, parsedArgs){

	 const usage = "Usage: node ecs_tasks_status.js --account_type <core|confinfo> " +
               "[--region <region>] --env <env> --cluster <cluster>\n";

	 // Verifica dei valori degli argomenti passati allo script
	 function isOkValue(argName,value,ok_values){
	     if(!ok_values.includes(value)) {
	     	console.log("Error: \"" + value + "\" value for \"--" + argName +
	        	"\" argument is not available, it must be in " + ok_values + "\n");
	     	process.exit(1);
	     }
	 };
	
	 // Elenco di cluster disponibili all'interno del profilo AWS
	 async function get_clusters_names() {
		const ecsClient = ecsClientInit();	
                const names = await ecsListClusters(ecsClient);
		const n = names.map(item => {
			return item = item.match(/[^/]+$/)[0];
		});
                return n;
        };

         // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
	 args.forEach(el => {
	   if(el.mandatory && !parsedArgs.values[el.name]){
	     console.log("\nParam \"" + el.name + "\" is not defined or empty.")
	     console.log(usage)
	     process.exit(1)
	   }
	 });
	
	const clusters = await get_clusters_names();
	const account_types = ["core","confinfo"];
	const envs = ["dev","test","hotfix","uat"];

	isOkValue("account_type",account_type,account_types);
	isOkValue("env",env,envs);
	isOkValue("cluster",cluster,clusters);
}


function ecsClientInit() {
    const profile = "sso_pn-" + account_type + "-" + env;
    const config = {
        region: region,
        profile: profile
    }
    const ecsClient = new ECSClient(config);
    return ecsClient;
}

// Elenco dei cluster ECS
async function ecsListClusters(ecsClient) {

    // const input = {};
    const command = new ListClustersCommand();
    const result = await ecsClient.send(command);
    return result.clusterArns;
}

// Elenco dei service
// Limite maxResults = 100. Vedi https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListServicesCommand/ 
// La funzione gestisce anche chiamate multiple tramite nextToken
async function ecsListServices(ecsClient,batchSize) {
    
    const input = { 
      cluster: cluster,
      maxResults: batchSize
    };
    
    let command = new ListServicesCommand(input);
    let result =  await ecsClient.send(command);

    while(result.nextToken !== undefined){
        input.nextToken = result.nextToken;
        let command = new ListServicesCommand(input);
        let partial =  await ecsClient.send(command);
        result.serviceArns = result.serviceArns.concat(partial.serviceArns);
        result.nextToken = partial.nextToken;
        // da rimuovere
        console.log(result.serviceArns.length);
    }
    return result.serviceArns;
}

// Describe di batch (max 10 item) di service
// vedi https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeServicesCommand/
async function ecsDescribeBatchServices(ecsClient,servicesList) {

    const input = { cluster: cluster };

    // Stampo gli header dell'output in CSV
    console.log("serviceName,desiredCount,runningCount");

    while(servicesList.length > 0) {
    
            let first10 = servicesList.slice(0,10);

            input.services = first10;                
            const command = new DescribeServicesCommand(input);

            let describeServices = await ecsClient.send(command);

            // Formatta singola riga
            let descSer = describeServices.services;
            descSer.forEach( item => {
                    let serName = item.serviceName.match(/^.+(?=-microsvc)/)[0];
                    console.log(serName + "," + item.desiredCount + "," + item.runningCount);
            });
    
            // Elimino i 10 services di serviceList che ho già processato
            servicesList.splice(0,10);
    }
}

// --- Inizio script ---

async function ecs_tasks_status() {

        await _checkingParameters(args, parsedArgs)
 
	// Inizializzo il client ecs
	const ecsClient = ecsClientInit();
	
	// Ottengo l'elenco dei cluster
	const clustersList = await ecsListClusters(ecsClient);
	
	// Ottengo l'elenco dei service
	const servicesList = await ecsListServices(ecsClient,35);
	
	// Stampo i dati associati a blocchi di servizi (max 10)
	ecsDescribeBatchServices(ecsClient,servicesList);
};

ecs_tasks_status();
