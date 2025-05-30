const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function appendJsonToFile(fileName, data){
  const resultPath = path.join(__dirname, 'results')
  if(!fs.existsSync(resultPath))
    fs.mkdirSync(resultPath, { recursive: true });
  fs.appendFileSync(resultPath + "/" + fileName, data + "\n")
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> --category <category>"
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
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "category", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, category },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      category: {
        type: "string", short: "c", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  //Prepare AWS Core
  const awsClient = new AwsClientsWrapper( 'core', envName );
  awsClient._initDynamoDB()
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(line=>line.trim()!='')
  for(let i = 0; i < fileRows.length; i++){
    const iun = fileRows[i]
    console.log(`Handling iun ${iun}` )
    const results = await awsClient._queryRequest("pn-Timelines", "iun", iun)
    if(results.Items.length > 0) { 
      const found = results.Items.find(e => {
        return e.category.S.toLowerCase() === category.toLowerCase()
      })
      if(found) {
        appendJsonToFile("found.txt", iun)
        console.log(`found ${category} for iun ${iun}` )
      }
      else {
        appendJsonToFile("notfound.txt", iun)
        console.log(`${category} not found for iun ${iun}` )
      }
    }
  }
}

main();