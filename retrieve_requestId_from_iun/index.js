const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("pn-common");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function removeExtension(fileName) {
  const idx = fileName.lastIndexOf('.')
  if(idx > 0) {
    return fileName.substring(0, idx)
  }
  else {
    return fileName
  }
}

function appendJsonToFile(outputFolder, fileName, data){
  if(!fs.existsSync(`results/${outputFolder}`))
    fs.mkdirSync(`results/${outputFolder}`, { recursive: true });
  fs.appendFileSync(`results/${outputFolder}/${fileName}`, data + "\n")
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> [--visibilityTimeout <visibility-timeout>] [--dryrun]"
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
    { name: "fileName", mandatory: true, subcommand: [] }

  ]
  const values = {
    values: { envName, fileName },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      }
    },
  });  
  _checkingParameters(args, values)
  const awsCoreClient = new AwsClientsWrapper( 'core', envName );
  const awsConfinfoClient = new AwsClientsWrapper( 'confinfo', envName );
  awsCoreClient._initDynamoDB()
  awsConfinfoClient._initDynamoDB()
  const fileNameWithoutExtension = removeExtension(fileName)
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n')
  for(let i = 0; i < fileRows.length; i++){
    const iun = fileRows[i]
    console.log(`Elaborating iun ${iun}`)
    let result = await awsCoreClient._queryRequest("pn-Timelines", "iun", iun)
    for(let x = 0; x < result.Items.length; x++){
      const tl = unmarshall(result.Items[x])
      if(tl.category == 'PREPARE_ANALOG_DOMICILE'){
        let notLatest = true
        for(let idx = 0; notLatest; idx++){
        const requestId = `${tl.timelineElementId}.PCRETRY_${idx}`
        let result = await awsConfinfoClient._queryRequest("pn-EcRichiesteMetadati", "requestId", `pn-cons-000~${requestId}`)
          if(result.Items.length > 0) {
            console.log(`Found requestId ${requestId}`)
            appendJsonToFile(fileNameWithoutExtension, 'requestId.txt', requestId)
          }
          else {
            notLatest = false;
          }
        }
      }
    };
  }
  /*for (let [key, value] of  iunsMap.entries()) {
    if(value) {
      const sqsMessage = prepareSqsMessage(key, value)
      appendJsonToFile("output.json", JSON.stringify(sqsMessage))
    }
    else {
      appendJsonToFile("error.txt", `${key} not found`)
    }
  }*/
}

main();