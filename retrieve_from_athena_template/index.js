const { parseArgs } = require('util');
const fs = require('fs');
const { AwsClientsWrapper } = require("pn-common");
const { sleep } = require('pn-common/libs/utils');

async function retrieveAndSaveCsv(executionId, awsClient, outputFilePath) {
  //delete file if exists
  if (fs.existsSync(outputFilePath)) {
    fs.unlinkSync(outputFilePath);
  } 
  //retrieve results until next token is null
  let nextToken = null;
  console.log("Retrieving results batch...");
  while (true) {
    const result = await awsClient._getQueryResults(executionId, nextToken);
    //convert result to csv format and save to file the first contains headers
    //append headers only the first time
    if (!nextToken) {
      const headers = result.ResultSet.ResultSetMetadata.ColumnInfo.map(col => col.Name).join(",");
      fs.appendFileSync(outputFilePath, headers + "\n");
    } 
    else {
      fs.appendFileSync(outputFilePath, "\n");
    }
    const rows = result.ResultSet.Rows.slice(nextToken ? 0 : 1).map(row => {
      return row.Data.map(data => `"${data.VarCharValue}"` || "").join(",");
    });
    fs.appendFileSync(outputFilePath, rows.join("\n"));
    nextToken = result.NextToken;
    if (!nextToken) {
      break;
    }
  }
  console.log(`Result written to file: ${outputFilePath}`);
}

async function executeQuery(awsClient, query, database, workgroup, catalog) {
  const result = await awsClient._startQueryExecution(workgroup, database, catalog, query);
  const queryExecutionId = result.QueryExecutionId;
  if (!queryExecutionId) {
    throw new Error("Failed to start query execution: No QueryExecutionId returned");
  }

  let fileResult;
  console.log("Query Execution ID:", queryExecutionId);
  while (true) {
    const queryExecution = await awsClient._getQueryExecution(queryExecutionId);
    const status = queryExecution.QueryExecution.Status.State;
    console.log(`Query execution status: ${status}`);
    if (status === 'SUCCEEDED') {
      break;
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(`Query execution failed with status: ${status}`);
    }
    await sleep(5000); // wait for 5 seconds before checking again
  }

  //retrieve results until next token is null
  return queryExecutionId;
}

function formatDateString(dateObj) {
  const yyyy = String(dateObj.getFullYear());
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getRangeTime() {
  const range = {}
  //set now as 30 dec 2025 for testing
  //const now = new Date(2026, 0, 6);
  const now = new Date();
  const day = now.getDay();
  // get last Sunday
  const lastSundayDiff = now.getDate() - day;
  const lastSunday = new Date(now.setDate(lastSundayDiff));
  range.endDate = formatDateString(lastSunday);
  // get previous Monday
  const previousMonday = new Date(lastSunday);
  previousMonday.setDate(lastSunday.getDate() - 6);
  range.startDate = formatDateString(previousMonday);
  return range;
}

function applyPlaceholders(queryFile, placeholders) {
  const query = fs.readFileSync(queryFile, 'utf8');
  let modifiedQuery = query;
  for (const [placeholder, value] of Object.entries(placeholders)) {
    const regex = new RegExp(placeholder, 'g');
    modifiedQuery = modifiedQuery.replace(regex, value);
  }
  return modifiedQuery;
}

function generatePartitionConditionWithBetween(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (start >= end) {
    throw new Error("La data di inizio deve essere precedente alla data di fine");
  }

  // Sottrai un giorno dall'end (perché è escluso)
  end.setDate(end.getDate());

  const result = [];
  const current = new Date(start);

  while (current <= end) {
    const y = current.getFullYear();
    const m = current.getMonth() + 1;
    const endOfMonth = new Date(y, m, 0);

    // Calcola giorno minimo e massimo per questo mese nel range
    const fromDay =
      current.getFullYear() === start.getFullYear() &&
      current.getMonth() === start.getMonth()
        ? start.getDate()
        : 1;

    const toDay =
      current.getFullYear() === end.getFullYear() &&
      current.getMonth() === end.getMonth()
        ? end.getDate()
        : endOfMonth.getDate();

    result.push(
      `(p_year = '${y}' AND p_month = '${String(m).padStart(2, "0")}' AND CAST(p_day AS INT) BETWEEN ${fromDay} AND ${toDay})`
    );

    // passa al mese successivo
    current.setMonth(current.getMonth() + 1, 1);
  }
  return {
    "<QUERY_CONDITION_Q1>": result.length === 1 ? result[0] : `(${result.join(" OR ")})`
  };
}

function _initFolder(values){
  values.forEach(value => {
    if(!fs.existsSync(value))
      fs.mkdirSync(value, { recursive: true });
  });
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --query <query>"
  //CHECKING PARAMETER
  args.forEach(el => {
    if(el.mandatory && !values.values[el.name]){
      console.log("Param " + el.name + " is not defined")
      console.log(usage)
      process.exit(1)
    }
  })
  args.filter(el=> {
    return el.subcommand.length > 0
  }).forEach(el => {
    if(values.values[el.name]) {
      el.subcommand.forEach(val => {
        if (!values.values[val]) {
          console.log("SubParam " + val + " is not defined")
          console.log(usage)
          process.exit(1)
        }
      })
    }
  })
}

async function main() {

  const args = [
    { name: "envName", mandatory: false, subcommand: [] },
    { name: "query", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, query },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      query: {
        type: "string", short: "q", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  const outputResultFolder = "results"
  _initFolder([outputResultFolder])
  const awsClient = envName ? new AwsClientsWrapper( 'core', envName ) : new AwsClientsWrapper();
  awsClient._initAthena();
  switch(true){
    case query === "extract_trackings":
      const database = "cdc_analytics_database";
      const workgroup = "cdc_analytics_workgroup";
      const catalog = "AwsDataCatalog";
      const range = getRangeTime();
      const queryCondition = generatePartitionConditionWithBetween(range.startDate, range.endDate);
      const modifiedQuery = applyPlaceholders(`resources/${query}.sql`, queryCondition);
      const outputFilePath = `${outputResultFolder}/${query}_result_${range.startDate}_to_${range.endDate}.csv`;
      
      console.log("Executing query:", query);
      const queryExecutionId = await executeQuery(awsClient, modifiedQuery, database, workgroup, catalog);
      if (!queryExecutionId) {
        console.warn(`No result for query ${query}, skipping.`);
        return;
      }
      await retrieveAndSaveCsv(queryExecutionId, awsClient, outputFilePath);
      break
  }

    
}

main();