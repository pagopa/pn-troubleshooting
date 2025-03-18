const { AwsClientsWrapper } = require("pn-common");
const { parseArgs } = require('node:util');
const { openSync, closeSync, mkdirSync, appendFileSync } = require('node:fs');
const { open } = require('node:fs/promises');
const { join } = require('node:path');

// ------------ Parametri input ---------------------

// --- Fissi ---
const accountType = "core";
const tableName = "pn-PaperRequestDelivery";

// --- Variabili ---
const args = [
    { name: "region", mandatory: false},
    { name: "env", mandatory: false},
    { name: "fileName", mandatory: true},
    { name: "startRequestId", mandatory: false}
  ];

  const parsedArgs = { values: { region, env, days, fileName, startRequestId }} = parseArgs(
      { options: {
            region: {type: "string", short: "r", default: "eu-south-1"},
            env: {type: "string",short: "e"},
            fileName: {type: "string",short: "f"},
            startRequestId: {type: "string",short: "a"}
        }
  });  

// --------------------------------------------------

function _checkingParameters(args, parsedArgs){

    const usage = "Usage: node index.js [--region <region>]" +
        " --env <env> --fileName <csv file> [--startRequestId <RequestId value>]\n";

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
};

function addAttribute(pk,ftu,Row){ //ftu = fieldToUpdate
    const input = {};
    input.keys = { 
        [pk]: Row // valore della pk da txt
    }; 
    input.values = {
        [ftu]: {
          codeAttr: '#' + ftu, // Alias del campo da aggiornare
          codeValue: ':new' + ftu, // Nome del nuovo valore da associare ad ftu
          value: true // Nuovo valore da associare al campo ftu
        }
      };
    return input;
};

function createOutputFile(folder) {
    mkdirSync(join(__dirname, "results", folder), { recursive: true });
    const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultPath = join(__dirname, "results", folder, 'updateItems_from_txt_' + dateIsoString + '.json');
    return resultPath;
};

async function main() {

    // Check dei parametri di input
    _checkingParameters(args,parsedArgs);

    // Inizializzazione client DynamoDB
    let dynDbClient;
    if(env) {
        dynDbClient = new AwsClientsWrapper(accountType, env );
    } else {
        dynDbClient = new AwsClientsWrapper();
    }
    dynDbClient._initDynamoDB();

    const inputFile = await open(fileName);
       
    const outputFile = createOutputFile("failed");
    failedFileHandler = openSync(outputFile,'a'); // Se il file non esiste verrà creato

    let keepSkip = 0;
    for await (const row of inputFile.readLines()) {
    
        if(startRequestId !== undefined & row !== startRequestId & keepSkip == 0){
            continue;
        } 
        else{
            keepSkip = 1;
        };

        // ftu = fieldToUpdate
        // Attributo da incrementare -----------------------|
        // PK ---------------------------|                  |     
        let input = addAttribute("requestId","applyRasterization",row);
        try {
            // l'ultimo campo è la condizione, in questo caso non necessaria
            await dynDbClient._updateItem(tableName, input.keys, input.values,'SET',);
            let objectPassed = JSON.stringify({
                requestId: row
           });
           console.log(objectPassed);
        } catch(e) {
            let objectFailed = JSON.stringify({
                requestId: row,
                error: {
                    name: e.name,
                    message: e.message
                }
            });
            console.log(objectFailed);
            appendFileSync(failedFileHandler,objectFailed);
            switch(e.name) {   
                case "ConditionalCheckFailedException":
                    break;
                default:
                    closeSync(failedFileHandler);
                    process.exit(1);
            };
        };
    };
    closeSync(failedFileHandler);
    await inputFile?.close();
};

main();
