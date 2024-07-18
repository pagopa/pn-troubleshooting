const { AwsClientsWrapper } = require("pn-common");
const { _parseCSV } = require("pn-common/libs/utils");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --fileName <fileName>"
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


function appendJsonToFile(filePath, fileName, data){
  const path = `results/${filePath}`
  if(!fs.existsSync(path))
    fs.mkdirSync(path, { recursive: true });
  fs.appendFileSync(`${path}/${fileName}`, data + "\n")
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
  //INIT AWS
  const date = new Date().toISOString();
  const data = await _parseCSV(fileName, ',')
  const awsConfinfoClient = new AwsClientsWrapper( 'confinfo', envName );
  awsConfinfoClient._initDynamoDB();
  for(let i = 0; i < data.length; i++) {
    const requestId = data[i].prepareRequestId
    const fileKey = data[i].docs
    let latestFound = true;
    let ecRichiesteData;
    let pcretry = 0;
    while(latestFound) {
      const tmp = await awsConfinfoClient._queryRequest("pn-EcRichieste", 'requestId', `pn-cons-000~${requestId}.PCRETRY_${pcretry}`)
      if(tmp.Items.length > 0) {
        ecRichiesteData = tmp.Items[0];
        pcretry += 1
      } else {
        latestFound = false
        ecRichiesteData = unmarshall(ecRichiesteData)
        pcretry -= 1
      }
    }
    let to_ignore = false;
    const requestIdWithPCretry = `${requestId}.PCRETRY_${pcretry}`
    ecRichiesteData.paperRequestPersonal.attachments.forEach(att => {
      if(att.order == 1 && att.uri.includes(fileKey)) {
        console.log(`to_ignore ${requestIdWithPCretry}`)
        appendJsonToFile(`${envName}_${date}`, `to_ignore.json`, requestIdWithPCretry)
        to_ignore = true;
      }
    });
    if(!to_ignore) {
      console.log(`to_verify ${requestIdWithPCretry}`)
      appendJsonToFile(`${envName}_${date}`, `to_verify.json`, requestIdWithPCretry)
    }
  }
}

main();