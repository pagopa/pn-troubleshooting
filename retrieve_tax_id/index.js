const { parseArgs } = require('util');
const fs = require('fs');
const { ApiClient } = require("./libs/api");
const { AwsClientsWrapper } = require("pn-common");
const { appendJsonToFile } = require('pn-common/libs/utils');

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name>"
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

function spliceArray(dataArray, dimension) {
  const blocks = [];
  for (let i = 0; i < dataArray.length; i += dimension) {
    const block = dataArray.slice(i, i + dimension);
    blocks.push(block);
  }
  return blocks;
}

function prepareUidsString(block) {
  let tmp = ''
  for(const b of block) {
    tmp = `${tmp}internalId=${b}&`
  }
  return tmp.substring(0, tmp.length-1)
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "dimensionRequest", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, dimensionRequest},
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "p", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
      dimensionRequest: {
        type: "string", short: "t", default: '10'
      },
    },
  });  

  _checkingParameters(args, values)
  const dimension = Number(dimensionRequest)
  if(dimension > 100) {
    console.log("Max dimension request is 100")
  }
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(x=>x!='')
  const blocks = spliceArray(fileRows, dimension)
  const date = new Date().toISOString()
  const result = {}
  let i = 1
  for(const block of blocks) {
    console.log(`Start block number ${i}`)
    const uidsString = prepareUidsString(block)
    const data = await ApiClient.decodeUIDs(uidsString)
    if(data && data.length > 0) {
      for(const d of data) {
        result[d.internalId] = d.taxId
      }
    }
    i = i + 1
  }
  console.log("Saving result...")
  appendJsonToFile(`results/${envName}-${date}/`, `${fileName.split('.')[0]}.json`, JSON.stringify(result))
}
main();