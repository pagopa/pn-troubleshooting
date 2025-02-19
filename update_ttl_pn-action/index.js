const { AwsClientsWrapper } = require("pn-common");
const { _parseCSV } = require("../pn-common/libs/utils.js");
const { parseArgs } = require('node:util');
const { openSync, closeSync, mkdirSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');

// ------------ Parametri input ---------------------

// --- Fissi ---
const accountType = "core";
const tableName = "pn-Action";

// --- Variabili ---
const args = [
    // { name: "account_type", mandatory: true}, // core
    { name: "region", mandatory: false},
    { name: "env", mandatory: false},
    { name: "days", mandatory: true},
    { name: "fileName", mandatory: true},
    { name: "startActionId", mandatory: false}
  ];

  const parsedArgs = { values: { region, env, days, fileName, startActionId }} = parseArgs(
      { options: {
            // account_type: {type: "string",short: "a"},
            region: {type: "string", short: "r", default: "eu-south-1"},
            env: {type: "string",short: "e"},
            days: {type: "string",short: "d"},
            fileName: {type: "string",short: "f"},
            startActionId: {type: "string",short: "a"}
        }
  });  

// --------------------------------------------------

function _checkingParameters(args, parsedArgs){

    const usage = "Usage: node index.js [--region <region>]" +
        " --env <env> --days <number> --fileName <csv file> [--startActionId <actionId value>]\n";

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

function increaseFtuInput(val,pk,ftu,csvRow){ //ftu = fieldToUpdate
    const input = {};
    input.keys = { 
        [pk]: csvRow[pk] // valore della pk da csv 
     // [sk]: csvRow[sk] // valore della sk da csv
    }; 
    input.values = {
        [ftu]: {
          codeAttr: '#' + [ftu], // Alias del campo da aggiornare
          codeValue: ':new' + [ftu], // Nome del nuovo valore da associare ad ftu
          // Devo parsare csvRow[ftu] in quanto valore numerico ottenuto dal file csv --> nasce come stringa 
            // e ottengo errori di calcolo
          value: parseInt(csvRow[ftu]) + ( val * 86400 ) // Nuovo valore da associare al campo ftu
          /*
          keys                  --> { actionId: { S: 'valore actionId' } }
          Alias per ttl         --> { '#ttl': 'newttl' }
          Nuovo valore di TTL   -->{ ':newttl': { N: '<numero>' } }
          Espressione nuovo ttl --> SET  #ttl = :newttl
          */
        }
      };
    return input;
};

function createOutputFile(folder) {
    mkdirSync(join(__dirname, "results", folder), { recursive: true });
    const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultPath = join(__dirname, "results", folder, 'updateItems_from_csv_' + dateIsoString + '.json');
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

    // _parseCSV Scarta automaticamente gli header ed elimina gli ""
    const parsedCsv = await _parseCSV(fileName,","); // array di oggetti
       
    const outputFile = createOutputFile("failed");
    failedFileHandler = openSync(outputFile,'a'); // Se il file non esiste verrà creato

    let keepSkip = 0;
    for(const row of parsedCsv) {

        // Skippa le righe del csv fino a quando non incontra quella con row.actionId === actionId
        if(startActionId !== undefined & row.actionId !== startActionId & keepSkip == 0){
            continue;
        } 
        else{
            keepSkip = 1;
        };

        // ftu = fieldToUpdate
        // Attributo da incrementare -----------------|
        // PK --------------------------------|       |
        // gg da aggiungere ---------|        |       |     
        let input = increaseFtuInput(days,"actionId","ttl",row);
        try {
            await dynDbClient._updateItem(tableName, input.keys, input.values,'SET',`attribute_exists(#ttl)`);
            let objectPassed = JSON.stringify({
                actionId: row.actionId
           });
           console.log(objectPassed);
        } catch(e) {
            let objectFailed = JSON.stringify({
                actionId: row.actionId,
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
};

main();
