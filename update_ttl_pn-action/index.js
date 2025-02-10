const { AwsClientsWrapper } = require("pn-common");
const { _parseCSV } = require("../pn-common/libs/utils.js")
const { parseArgs } = require('util');
const { mkdirSync } = require('node:fs');
const fs = require('node:fs/promises');
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const path = require('path');

// ------------ Parametri input ---------------------

// --- Fissi ---
const accountType = "core"; // 207905393513 account id pn-core-hotfix
const tableName = "pn-Action";

// --- Variabili ---
const args = [
    // { name: "account_type", mandatory: true}, // core
    { name: "region", mandatory: false},
    { name: "env", mandatory: true},
    { name: "days", mandatory: true},
    { name: "fileName", mandatory: true}
  ];

  const parsedArgs = { values: { region, env, days, fileName }} = parseArgs(
      { options: {
            // account_type: {type: "string",short: "a"},
            region: {type: "string", short: "r", default: "eu-south-1"},
            env: {type: "string",short: "e"},
            days: {type: "string",short: "d"}, //
            fileName: {type: "string",short: "f"}
        }
  });  

// --------------------------------------------------

function _checkingParameters(args, parsedArgs){

    const usage = "Usage: node index.js [--region <region>]" +
        " --env <env> --days <number> --fileName <csv file>\n";

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
	
	// const account_types = ["core","confinfo"];
	// isOkValue("account_type",account_type,account_types);

	const envs = ["dev","test","hotfix","uat"];
	isOkValue("env",env,envs);
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
          value: parseInt(csvRow[ftu]) + ( val * 86400000 ) // Nuovo valore da associare al campo ftu
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
    mkdirSync(path.join(__dirname, "results", folder), { recursive: true });
    const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultPath = path.join(__dirname, "results", folder, 'updateItems_from_csv_' + dateIsoString + '.json');
    return resultPath;
    //fs.writeFileSync(resultPath, JSON.stringify(result, null, 4), 'utf-8')
};

async function main() {

    // _parseCSV Scarta automaticamente gli header ed elimina gli ""
    const parsedCsv = await _parseCSV(fileName,","); // array di oggetti
    
    passedFileHandler = await fs.open(createOutputFile("passed"),'a'); // Se il file non esiste verrà creato
    failedFileHandler = await fs.open(createOutputFile("failed"),'a'); // Se il file non esiste verrà creato
    
    for(const row of parsedCsv) {
        // ftu = fieldToUpdate
        // Attributo da incrementare -----------------|
        // PK --------------------------------|       |
        // gg da aggiungere ---------|        |       |     
        let input = increaseFtuInput(days,"actionId","ttl",row);
        try {
            const { Attributes } = await dynDbClient._conditionalUpdateItem(tableName, input.keys, input.values,'SET',`attribute_exists(#ttl)`);
            let returnedActionId = unmarshall(Attributes).actionId;
            passedFileHandler.appendFile(returnedActionId + '\n');
            console.log("OK: " + returnedActionId);
        } catch(e) {
            if (e.__type.includes("ConditionalCheckFailedException")){
                console.log("WARN: Item with actionId '" + row.actionId + "' is empty");
                failedFileHandler.appendFile(row.actionId + '\n');
            } 
            else {
                console.log(e);
                passedFileHandler?.close();
                failedFileHandler?.close();
                process.exit(1);
            }
        };
    };
    passedFileHandler?.close();  
    failedFileHandler?.close();
};

// Check dei parametri di input
_checkingParameters(args,parsedArgs);

// Inizializzazione client DynamoDB
const dynDbClient = new AwsClientsWrapper(accountType,env);
dynDbClient._initDynamoDB();

main();
