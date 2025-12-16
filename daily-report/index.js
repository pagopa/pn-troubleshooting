const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <env-name> [--json]"
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
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "json", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, json },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      json: {
        type: "boolean", short: "j", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  
  const res = await awsClient._fetchAllDLQ();
  if(json) {
      console.log(JSON.stringify(res,null,2))
  } else {
      console.log(res);
  }
}

main();
