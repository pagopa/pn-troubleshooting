const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --profile <profile> --tableName <tableName> --fileName <fileName> [--batchDimension <batchDimension]"
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
    { name: "profile", mandatory: true, subcommand: [] },
    { name: "tableName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "batchDimension", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { profile, tableName, fileName, batchDimension},
  } = parseArgs({
    options: {
      profile: {
        type: "string", short: "p", default: undefined
      },
      tableName: {
        type: "string", short: "t", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      batchDimension: {
        type: "string", short: "b", default: "25"
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( profile );
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  const lines = data.trim().split('\n');
  const elements = lines.map(JSON.parse);
  batchDimension = Number(batchDimension)
  for (i = 0; i < elements.length; i = i+batchDimension){
    const batch = elements.slice(i, i+batchDimension);
    console.log("N° " + ((i+batchDimension > elements.length) ? elements.length : i+batchDimension) + " elements imported!")
    await awsClient._batchWriteItems(tableName, batch);
    
  }
  console.log("Import Complete")
}

main();