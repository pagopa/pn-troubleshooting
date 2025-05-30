const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { parse } = require('csv-parse');

const headers = ["iun", "requestID", "receiverName"]

function appendJsonToFile(fileName, data){
  const resultPath = path.join(__dirname, "result")
  if(!fs.existsSync(resultPath))
    fs.mkdirSync(resultPath, { recursive: true });
  fs.appendFileSync(resultPath + "/" + fileName, JSON.stringify(data) + "\n")
}

function _parseCSV(fileName) {
  return new Promise((resolve, reject) => {
    let results = [];
    const parser = fs.createReadStream(fileName).pipe(parse({
      columns: true, 
      delimiter: ',', 
      trim: true
    }));
    parser.on('data', (data) => {
      results.push(data)
    });
    parser.on('error', (err) => {
      reject(err);
    });
    parser.on('end', () => {
      resolve(results);
    });
  })
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --hashKey <pkey> --sortKey <skey>"
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
    { name: "hashKey", mandatory: true, subcommand: [] },
    { name: "sortKey", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { envName, hashKey, sortKey},
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      hashKey: {
        type: "string", short: "p", default: undefined
      },
      sortKey: {
        type: "string", short: "s", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  let logicalOperator = 'and'
  let keys = {
    hashKey: {
      codeAttr: '#P',
      codeValue: ':p',
      value: hashKey,
      operator: '='
    },
    sortKey: {
      codeAttr: '#S',
      codeValue: ':s',
      value: sortKey,
      operator: '>='
    }
  }
  const res = await awsClient._dynamicQueryRequest("pn-WebhookEvents", keys, logicalOperator)
  if(res.Items.length > 0) {
    console.log(`N° ${res.Items.length} found`)
    const duplicated = {}
    res.Items.forEach(e => {
      e = unmarshall(e)
      appendJsonToFile("backup.json", e)
      if(!duplicated[e.element]) {
        duplicated[e.element] = {
          sortKey: [],
          qnt: 1
        }
        duplicated[e.element].sortKey.push(e.sortKey)
      }
      else {
        duplicated[e.element].qnt += 1
        duplicated[e.element].sortKey.push(e.sortKey)
      }
    });
    Object.keys(duplicated).forEach(key => {
      if(duplicated[key].qnt > 1) {
        console.log(`Found duplicated for ${duplicated[key].qnt} elements! ${hashKey} ${duplicated[key].sortKey}`)
        appendJsonToFile("result.json", {[hashKey]: { sortKey: duplicated[key].sortKey, qnt: duplicated[key].qnt}})
      }
    })
  }
  else {
    console.log("No item found")
  }
}

main();