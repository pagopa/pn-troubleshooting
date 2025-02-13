const { _parseCSV } = require("../pn-common/libs/utils.js");
const { openSync, closeSync, mkdirSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');
const { parseArgs } = require('node:util');

// --- Variabili ---

// - Costanti -
const notToHandle = "false";

// - Parametri -
const args = [
    { name: "fileName", mandatory: true},
    { name: "ttl", mandatory: true},
    { name: "start", mandatory: false}
  ];

const parsedArgs = { values: { fileName, ttl, start}} = parseArgs(
    { options: {
        fileName: {type: "string",short: "f"},
        ttl: {type: "string",short: "t"},
        start: {type: "string",short: "s"}
    }
  });  

  // ----------------

  function _checkingParameters(args, parsedArgs){

    const usage = "Usage: node index.js [--region <region>]" +
        " --env <env> --fileName <csv file> --ttl <days in ms> [--start <timelineElementId value>]\n";

    // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
	args.forEach(el => {
	    if(el.mandatory && !parsedArgs.values[el.name]){
	        console.log("\nParam \"" + el.name + "\" is not defined or empty.")
	        console.log(usage)
	        process.exit(1)
	    }
	 });
};

function createOutputFile() {
    mkdirSync(join(__dirname, "results"), { recursive: true });
    const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const resultPath = join(__dirname, "results", 'create_action_from_feedback_' + dateIsoString + '.csv');
    return resultPath;
};

// funzione per il parsing dei file csv
// campi csv: "iun","timelineelementid","timestamp","category"
async function main() {

    _checkingParameters(args,parsedArgs);

    const parsedCsv = await _parseCSV(fileName, ",");

    const outputFile = createOutputFile();

    const outputCsvFileHandler = openSync(outputFile,'a');

    const outputHeader = "actionId,ttl,notToHandle\n"; //append file
    appendFileSync(outputFile,outputHeader);

    let keepSkip = 1;
    for(const row of parsedCsv){ 

        // Skippa le righe del csv fino a quando non incontra quella con row.actionId === actionId
        if(start !== undefined & row.timelineelementid !== start & keepSkip == 1){
            continue;
        } 
        else{
            keepSkip = 0;
        };

        let { timelineelementid } = row;
        let actionId; // PK   
        
        if(timelineelementid.includes('SEND_ANALOG_FEEDBACK')){
            // send_analog_final_status_response_feedback-timeline-id_<timelineElementId>
            actionId = "send_analog_final_status_response_feedback-timeline-id_" + timelineelementid;
        }
        else if (timelineelementid.includes('SEND_DIGITAL_FEEDBACK')){
            // <iun>_send_digital_final_status_response_feedback-timeline-id_<timelineElementId>
            actionId = row.iun + "_send_digital_final_status_response_feedback-timeline-id_" + timelineelementid;
        }
        else {
            const e = new Error(
                "timelineElementId field for iun '" + row.iun + 
                "' does not contain 'SEND_ANALOG_FEEDBACK' or 'SEND_DIGITAL_FEEDBACK' substring",
            );
            e.name = "timelineElementIdError"
            throw e;
        };

        let outputRow = actionId + "," + ttl + "," + notToHandle + "\n";
        appendFileSync(outputFile,outputRow);
    }

    closeSync(outputCsvFileHandler);
};

main();



