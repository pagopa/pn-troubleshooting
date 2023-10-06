const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const fs = require('fs');
const { parseArgs } = require('util');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <env-name> --startDate <YYYYMM> [--endDate <YYYYMM>]"
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

async function _writeInFile(result, filename ) {
  fs.mkdirSync("result", { recursive: true });
  fs.writeFileSync('result/' + filename+'.json', JSON.stringify(result, null, 4), 'utf-8')
}

async function checkStatus(awsClient, tableName, data){
  const keys = Object.keys(data);
  const toExport = []
  for ( const k of keys ) {
    let toDelete = false;
    params = {
      ExpressionAttributeValues: {
        ":value": {
          "S": k
        },
      },
      KeyConditionExpression: "pk = :value"
    }
    const result = await awsClient._queryDynamoDB(tableName, null, params)
    result.forEach(value => {
      if (value?.status?.S.indexOf('OK' > 0)) {
        console.log("Found status 'OK' for fileKey= " + k)
        toDelete = true;
      }
    })
    if(!toDelete) {
      console.log("No status 'OK' found for fileKey= " + k)
      toExport.push(data[k])
    }
  }
  return toExport;
}

function _getListParams(startDate, endDate) {
  list = []
  startD = {
    year: (startDate+"").substring(0,4),
    month: (startDate+"").substring(4,6)
  };
  endD = {
    year: (endDate+"").substring(0,4),
    month: (endDate+"").substring(4,6)
  }
  if(endD.year > startD.year) {
    let diffYear = endD.year - startD.year;
    for (idx = 1; idx < diffYear; idx++) {
      if(idx != diffYear){
        for(let month = 1;month <= 12; month++) {
          list.push((parseInt(startD.year)+idx).toString() + month.toString().padStart(2, '0'))
        }
      }
    }
    list.push(startDate)
    for (i = 12 - startD.month; i > 0; i--) {
      list.push((parseInt(startDate)+i).toString())
    }
    for (i = endD.month; i > 0; i--) {
      list.push((parseInt(endDate)-i+1).toString())
    }
  }
  else {
    let end = endDate - startDate 
    for (i = 0; i <= end; i++) {
      list.push((parseInt(startDate)+i).toString())
    }
  }
  console.log(list.sort())
  return list.sort();
}

async function getLegalConservationHistoryRequest(awsClient, params){
  console.log("Extracting data from " + tableName + " for index " + params.ExpressionAttributeValues[":value"].S)
  const extractData = {}
  const res = await awsClient._queryDynamoDB(tableName, indexValue, params);
  res.forEach(item => {
    if (extractData[item?.pk?.S] == undefined) {
      extractData[item?.pk?.S] = []
    }
    extractData[item?.pk?.S].push({
      fileKey: item?.fileKey?.S,
      externalId: item?.externalId?.S,
      statusDate: item?.statusDate?.S,
      errorCode: item?.errorCode?.S,
      status: item?.status?.S
    })
  })
  return extractData;
}


const tableName =  "pn-legal-conservation-request-history"
const indexValue = "sortBy-errorTimestamp"

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "startDate", mandatory: true, subcommand: [] },
    { name: "endDate", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, startDate, endDate },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      startDate: {
        type: "string", short: "s", default: undefined
      },
      endDate: {
        type: "string", short: "f", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)

  const awsClient = new AwsClientsWrapper( envName );

  var result = {};
  if (!endDate){
    endDate = new Date().getFullYear().toString() + new Date().getMonth().toString().padStart(2, '0')
  }
  listDate = _getListParams(startDate, endDate);
  
  for( let date of listDate ) {
      params = {
        ExpressionAttributeValues: {
          ":value": {
            "S": date
          },
        },
        KeyConditionExpression: "errorResponseTimestampYearMonth = :value"
    }
    resultTmp = await getLegalConservationHistoryRequest(awsClient, params)
    Object.keys(resultTmp).forEach(k => {
      if (result.hasOwnProperty(k)) {
        result[k].push(resultTmp[k]);  
      }
      else {
        result[k] = []
        result[k].push(resultTmp[k]);  
      }
    })
  }
  
  console.log("Checking if status 'OK' for each fileKey")
  const toExport = {
    documents: await checkStatus(awsClient, tableName, result)
  }
  if(toExport.documents.length > 0) {
    await _writeInFile(toExport, "ExportedErrors")
    console.log("N° " + toExport.documents.length + " exported in ExportedErrors.json")
  }
  else {
    console.log("No data to export")
  }
}

main();