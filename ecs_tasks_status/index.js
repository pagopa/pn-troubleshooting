const { AwsClientsWrapper } = require("pn-common");
const { parseArgs } = require('util');

// Necessario "aws sso login --profile sso_pn-core-hotfix" preliminare

const args = [
  { name: "account_type", mandatory: true},
  { name: "region", mandatory: false},
  { name: "env", mandatory: true}
];

const parsedArgs = { values: { account_type, region, env }} = parseArgs(
    { options: {
          account_type: {type: "string",short: "a"},
          region: {type: "string", short: "r", default: "eu-south-1"},
          env: {type: "string",short: "e"}
      }
})

// --- Definizione Funzioni ---

async function ecs_tasks_status() {

function _checkingParameters(args, parsedArgs){

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

    // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
	args.forEach(el => {
	    if(el.mandatory && !parsedArgs.values[el.name]){
	        console.log("\nParam \"" + el.name + "\" is not defined or empty.")
	        console.log(usage)
	        process.exit(1)
	    }
	 });
	
	const account_types = ["core","confinfo"];
	isOkValue("account_type",account_type,account_types);

	const envs = ["dev","test","hotfix","uat"];
	isOkValue("env",env,envs);
}

async function _listServiceArns(client,cluster,maxResults) {

    // Ref: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/ListServicesCommand/
    // min(maxResults) = 10 = default;
    // max(maxResults) = 100.

    const result = await client._listServices(cluster,maxResults);

    while(result.nextToken !== undefined){
        //input.nextToken = result.nextToken;
        let partial = await client._listServices(cluster,maxResults,result.nextToken);
        result.serviceArns = result.serviceArns.concat(partial.serviceArns);
        result.nextToken = partial.nextToken;
    }
    return result.serviceArns;
};

async function _servicesObject(client,cluster,svcListArns,csvReport) {

    // Ref: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/command/DescribeServicesCommand/
    // La describe avviene per blocchi di 10 elementi. Questa funzione automatizza il processo.

    let svcArray = { services: []};

    while(svcListArns.length > 0) {

        // Recupero i primi 10 servizi dall'array
        let first10 = svcListArns.slice(0,10);
        let svcElement;

        const describeServices = await client._describeServices(cluster,first10);
        describeServices.services.forEach( item => {
            //let shortServiceName = item.serviceName.match(/^.+(?=-microsvc)/)[0];
            let shortServiceName = item.serviceName.match(/[^/]+$/)[0];
            if(csvReport) {
                console.log(shortServiceName + "," + item.desiredCount + "," + item.runningCount);
            };
            svcElement = {
                shortServiceName: shortServiceName,
                desiredCount: item.desiredCount,
                runningCount: item.runningCount
            };
            svcArray.services.push(svcElement);
        });

        // Elimino i 10 service appena processati dall'array
        svcListArns.splice(0,10);
    }
    return svcArray;
};

// --------------------------- Nuove

async function _shortClusterNames(awsClient){
    const clusterNames = await awsClient._listClusters();
    const shortClusterNames = clusterNames.clusterArns.map(item => {
	    return item.match(/[^/]+$/)[0];
	});
    return shortClusterNames; // Array
};

async function _clustersObject(awsClient) {
    const clusterNames = await _shortClusterNames(awsClient);

    let outputObject = { 
        clusters: []
    };

    for(const cl of clusterNames) {

        let listServicesArns = await _listServiceArns(awsClient,cl);
        let servicesObject = await _servicesObject(awsClient,cl,listServicesArns,false);

        let clusterElem = {
            name: cl,
            services: servicesObject.services // Array di service
       };

       // Il problema è qui, nel push!
       outputObject.clusters.push(clusterElem); 
    }
    return outputObject;
}

// ----------------------------- Inizio script

    _checkingParameters(args, parsedArgs);
 
    // Inizializzazione ECS client
    const ecsClient = new AwsClientsWrapper(account_type,env);
    ecsClient._initECS();

    const outputObject = await _clustersObject(ecsClient)

    console.log(outputObject);
    
    return outputObject;
}

ecs_tasks_status();
