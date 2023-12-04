const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: node index.js --awsProfile <aws-profile> --tableName <table-name> --filter <filter>"
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

async function main() {

  const args = [
    { name: "awsProfile", mandatory: true, subcommand: [] },
    { name: "tableName", mandatory: true, subcommand: [] },
    { name: "filter", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { awsProfile, tableName, filter },
  } = parseArgs({
    options: {
      awsProfile: {
        type: "string", short: "p", default: undefined
      },
      tableName: {
        type: "string", short: "t", default: undefined
      },
      filter: {
        type: "string", short: "f", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( awsProfile );
  
  const res = await awsClient._scanRequest(tableName);
  await _writeInFile(res, "RequestIDx")
  console.log('Sono stati memorizzati n° ' + res.length + ' elementi.');

}

main();