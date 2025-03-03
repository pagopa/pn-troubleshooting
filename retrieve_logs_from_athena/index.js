const { AwsClientsWrapper } = require("pn-common");
const { parseArgs } = require('node:util');
const { openSync, closeSync, mkdirSync, appendFileSync } = require('node:fs');
const { open } = require('node:fs/promises');
const { join } = require('node:path');

// ------------ Parametri input ---------------------

// --- Fissi ---

const env = "";
const accountType = "";
const action = "" // exec | retrieve

const okIunFile = "";
const startIun = undefined;

const reqIdFile = ""
const startReqId = undefined;

// --- Variabili ---

/*

const args = [
    { name: "region", mandatory: false },
    { name: "env", mandatory: false },
    { name: "accountType", mandatory: false },
    { name: "action", mandatory: true },
    { name: "okIunFile", mandatory: false },
    { name: "reqIdFile", mandatory: false },
    { name: "startIun", mandatory: false },
    { name: "starReqId", mandatory: false }
];

const parsedArgs = { values: { region, env, accountType, action, okIunFile, reqIdFile, startIun, startReqId }} = 
parseArgs({
    options: {
        region: { type: "string", short: "r", default: "eu-south-1" },
        env: { type: "string", short: "e" },
        accountType: { type: "string", short: "t" },
        action: { type: "string", short: "a" },
        okIunFile: { type: "string", short: "o" },
        reqIdFile: { type: "string", short: "i" },
        startIun: { type: "string", short: "O" },
        startReqId: { type: "string", short: "I" }
    }
});

*/

// --------------------------------------------------

async function main() {

    function _checkingParameters(args, parsedArgs) {

        const usage = "Usage: node index.js [--region <region>]" +
            " --env <env> --days <number> --fileName <csv file> [--startActionId <actionId value>]\n";

        // Verifica dei valori degli argomenti passati allo script
        function isOkValue(argName, value, ok_values) {
            if (!ok_values.includes(value)) {
                console.log("Error: \"" + value + "\" value for \"--" + argName +
                    "\" argument is not available, it must be in " + ok_values + "\n");
                process.exit(1);
            }
        };

        // Verifica se un argomento è stato inserito oppure inserito con valore vuoto
        args.forEach(el => {
            if (el.mandatory && !parsedArgs.values[el.name]) {
                console.log("\nParam \"" + el.name + "\" is not defined or empty.")
                console.log(usage)
                process.exit(1)
            }
        });
    };

    function mkdirResultsFolder(folder) {
        const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        const resultPath = join(__dirname, "results", folder + "_" + dateIsoString);
        mkdirSync(resultPath, { recursive: true });
        return resultPath;
    };

    function pathOutputFile(resultFolder, fileName) {
        return resultPath = join(resultFolder, fileName);
    };

    async function _closeAllFiles() {
        await reqIdFileHandler?.close;
        okIunFileHandler?.close;
        closeSync(failedFileHandler);
        closeSync(athenaLogsFileHandler);
    };

    // ----

    function queryCreator(db, timestamp, elementTimelineId) {

        // timestamp example: 2024-07-01T13:45:54.602282976Z

        const date = {
            year: timestamp.match(/^\d{4}/),
            month: timestamp.match(/(?<=-)\d{2}(?=-)/),
            day: timestamp.match(/(?<=-)\d{2}(?=T)/),
            hour: timestamp.match(/(?<=T)\d{2}(?=:)/)
        };

        /*
        sqlQuery = `
        select * from ${db}.ecs_microservices_view
        where year = '${date.year}
            and month = '${date.month}'
            and day = '${date.day}'
            and (hour = '${date.hour}' or hour = '${(parseInt(date.hour) + 1)}')
            and logstream like 'ecs/pn-national-regis%'
            and log_message like 'pnNationalRegistriesGatewayRequestConsumer- message: GenericMessage [payload=PnAddressGatewayEvent.Payload(correlationId=%'
            and log_message like '%${elementTimelineId}%'
            `
        */

        sqlQuery = "select * from " + db + ".ecs_microservices_view" + "\n" +
            "where year = '" + date.year + "'\n" +
            " and month = '" + date.month + "'\n" +
            " and day = '" + date.day + "'\n" +
            " and (hour = '" + date.hour + "' or hour = '" + (parseInt(date.hour) + 1) + "')\n" +
            " and logstream like 'ecs/pn-national-regis%'" + "\n" +
            " and log_message like 'pnNationalRegistriesGatewayRequestConsumer- message: GenericMessage [payload=PnAddressGatewayEvent.Payload(correlationId=%'" + "\n" +
            " and log_message like '%" + elementTimelineId + "%'";

        return sqlQuery
    };

    async function startQueryExec(row, db) {

        try {
            const sqlQuery = queryCreator("log_analytics_database", row.timestamp, row.timelineElementId);
            // Avvio una query asincrona e salvo il requestId

            let { QueryExecutionId } = await athenaClient._startQueryExecution(
                "LogAnalyticsWorkGroup", db, "AwsDataCatalog", sqlQuery
            );
            let queryExecResult = JSON.stringify({
                QueryExecutionId: QueryExecutionId,
                timestamp: row.timestamp,
                timelineElementId: row.timelineElementId
            });

            console.log(queryExecResult);
            appendFileSync(reqIdFileHandler, queryExecResult + '\n');

            return QueryExecutionId
        }
        catch (e) {
            let objectFailed = JSON.stringify({
                iun: row.iun,
                error: {
                    name: e.name,
                    message: e.message
                }
            });
            console.log(objectFailed);
            appendFileSync(failedFileHandler, objectFailed);
            switch (e.name) {
                case "InvalidRequestException":
                    break;
                default:
                    closeSync(failedFileHandler);
                    process.exit(2);
            };
        };
    };

    async function isOkStatus(reqId) {

        let status = "RUNNING";
        while (status === 'RUNNING') {
            try {
                let requestStatus = await athenaClient._getQueryExecution(reqId);
                status = requestStatus.QueryExecution.Status.State;
                if (status === 'RUNNING') {
                    console.log(reqId + " status is 'RUNNING'. Waiting...")
                    await new Promise(resolve => setTimeout(() => {resolve()}, 5000)); // Attendi 5 secondi 
                }
            }
            catch (e) {
                if (e.message.includes("QUEUED")) {
                    console.log(reqId + " status is 'QUEUED'. Waiting...")
                    await new Promise(resolve => setTimeout(() => {resolve()}, 5000)); // Attendi 5 secondi
                    status = 'RUNNING';
                    console.log("Catched status: " + status)
                } else {
                    console.log(e);
                    closeSync(failedFileHandler);
                    process.exit(3);
                };
            };
        };
    };

    async function retrieveLogResult(reqId, startReqId) {

        function msgAttrParser(str) {
            return JSON.parse(str.replace(/={/g, ': {').
                replace(/\w+: \[\]/g, '').
                replace(/,+/g, ',').
                replace(/([a-zA-z-]+)/g, '"$1"').
                replace(/,+}/g, '}').
                replace(/,+]/g, ']')
            );
        };

        try {
            let queryResult = await athenaClient._getQueryResults(reqId,);
            // ? per indicare che il risultato della query potrebbe essere vuoto
            let log_message = queryResult.ResultSet.Rows[1]?.Data[20].VarCharValue
            let sqsObj;
            if (log_message) {
                sqsObj = JSON.stringify({
                    Body: log_message.match(/(?<=Body: )\{.+\}(?=,Attributes)/)[0],
                    MessageAttributes: msgAttrParser(
                        log_message.match(/(?<=MessageAttributes: )\{.+\}(?=}, lookupDestination)/)[0]
                    )
                });
            }
            else {
                sqsObj = "<Empty result>"
            };
            appendFileSync(athenaLogsFileHandler, sqsObj + '\n');
        }
        catch (e) {
            let objectFailed = JSON.stringify({
                QueryRequestId: reqId,
                error: {
                    name: e.name,
                    message: e.message
                }
            });
            console.log(objectFailed);
            appendFileSync(failedFileHandler, objectFailed + '\n');
            switch (e.name) {
                case "InvalidRequestException":
                    break;
                default:
                    closeSync(failedFileHandler);
                    process.exit(4);
            };
        };
    };

    // ---------- Script ----------------

    // Check dei parametri di input
    //_checkingParameters(args, parsedArgs);

    // Inizializzazione client Athena
    let athenaClient;
    if (env) {
        athenaClient = new AwsClientsWrapper(accountType, env);
    } else {
        athenaClient = new AwsClientsWrapper();
    }
    athenaClient._initAthena();

    // ------------------------------

    const resultFolder = mkdirResultsFolder(action);

    const okIunFileHandler = await open(okIunFile, 'r');

    const reqIdFilePath = pathOutputFile(resultFolder, "reqId.json");
    const reqIdFileHandler = openSync(reqIdFilePath, 'a');

    const failedFilePath = pathOutputFile(resultFolder, "failed.json");
    const failedFileHandler = openSync(failedFilePath, 'a');

    const athenaLogsFilePath = pathOutputFile(resultFolder, "log.json");
    const athenaLogsFileHandler = openSync(athenaLogsFilePath, 'a');

    // ------------------------------

    switch (action) {

        case "exec":

            if (!okIunFile) {
                console.log("---> Error: parameter '--action=exec' require the '--okIunFile=<fileName> parameter. Exit.'");
                _closeAllFiles();
                process.exit(5)
            };

            let keepSkip = 1;
            for await (const row of okIunFileHandler.readLines()) {

                let el = JSON.parse(row);

                // Skippa le righe del csv fino a quando non incontra quella con row.actionId === actionId
                if (startIun !== undefined & el.iun !== startIun & keepSkip == 1) {
                    continue;
                }
                else {
                    keepSkip = 0;
                };

                let queryExecId = await startQueryExec(el, "log_analytics_database");
                await new Promise(resolve => setTimeout(() => {resolve()}, 5000));
                await isOkStatus(queryExecId);
                await retrieveLogResult(queryExecId, startReqId);
            };
            break;

        case "retrieve":

            if (!reqIdFile) {
                console.log("---> Error: parameter '--action=retrieve' require the '--reqIdFile=<fileName> parameter. Exit.'");
                _closeAllFiles();
                process.exit(6)
            } else {

                const reqIdFileHandler = await open(reqIdFile, 'r');

                let keepSkip = 1;
                for await (const row of reqIdFileHandler.readLines()) {

                    let queryExecId = JSON.parse(row).QueryExecutionId;

                    // Skippa le righe del csv fino a quando non incontra quella con row.actionId === actionId
                    if (startReqId !== undefined & queryExecId !== startReqId & keepSkip == 1) {
                        continue;
                    }
                    else {
                        keepSkip = 0;
                    };

                    await isOkStatus(queryExecId);
                    await retrieveLogResult(queryExecId, startReqId);
                };
            };
            break;

        default:
            console.log(" ---> Error: Available actions are 'exec' or 'retrieve'. Exit");
    };

    await _closeAllFiles();
};

main();
