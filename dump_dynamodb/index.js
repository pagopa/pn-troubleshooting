const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require("@aws-sdk/util-dynamodb")

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


async function _writeInFile(result) {
  fs.mkdirSync("result", { recursive: true });
  const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  const resultPath = path.join(__dirname, 'result/dump' +'_'+queueName+'_'+dateIsoString+'.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 4), 'utf-8')
}

async function _writeInFile(result, filename, json ) {
  fs.mkdirSync("result", { recursive: true });
  let str;
  if(json) {
    str = result.map(el => {
      return JSON.stringify(unmarshall(el))
    }).join('\n')
  }
  else {
    str = result.map(el => {
      return JSON.stringify(el, null)
    }).join('\n')
  }
  fs.writeFileSync('result/' + filename+'.json', str, 'utf-8')
}

async function main() {

  const args = [
    { name: "awsProfile", mandatory: true, subcommand: [] },
    { name: "tableName", mandatory: true, subcommand: [] },
    { name: "filter", mandatory: false, subcommand: [] },
    { name: "json", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { awsProfile, tableName, filter, json },
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
      json: {
        type: "boolean", short: "m", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( awsProfile );
  let first = true;
  var results = []
  var lastEvaluatedKey = null
  while(first || lastEvaluatedKey != null) {
    var res = await awsClient._scanRequest(tableName, lastEvaluatedKey);
    if(res.LastEvaluatedKey) {
      lastEvaluatedKey = res.LastEvaluatedKey
    } 
    else {
      lastEvaluatedKey = null;
      first = false;
    }
    results = results.concat(res.Items);
  }
  await _writeInFile(results, results.length+"_"+tableName+"_"+awsProfile, json)
  console.log('Sono stati memorizzati n° ' + results.length + ' elementi.');

}

main();