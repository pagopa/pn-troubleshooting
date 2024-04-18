const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');
const path = require('path');

function _getIunFromRequestId(requestId) {
  return requestId.split("IUN_")[1].split(".")[0];
}

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

function appendJsonToFile(fileName, data){
  fs.appendFileSync(fileName, data + "\n")
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, timing },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const resultPath = path.join(__dirname, "results/");
  if(!fs.existsSync(resultPath)) {
    fs.mkdirSync(resultPath, { recursive: true });
  }
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  for (requestId of data) {
    if (requestId === '')
      continue
    try {
      const iun = _getIunFromRequestId(requestId)
      const paperRequestPersonal = (await awsClient._queryRequest("pn-EcRichieste", 'requestId', 'pn-cons-000~' + requestId, 'paperRequestPersonal')).Items[0];
      const attachments = (unmarshall(paperRequestPersonal))['paperRequestPersonal'].attachments
      let temp = {
        AAR: '',
        ATTI: {
          iun: iun,
          sentAt: null,
          attachments: []
        }
      }
      for(const doc of attachments) {
        const docKey = doc.uri.replace("safestorage://", "")
        if(doc.documentType == 'AAR') {
          temp.AAR = iun + "," +  docKey
        }
        else if(doc.documentType == 'ATTO') {
          temp.ATTI.attachments.push(docKey) 
        }
        else {
          console.log("not implemented for " + doc.documentType + " " + requestId)
        }
      }
      appendJsonToFile(resultPath + 'aar.json', temp.AAR)
      appendJsonToFile(resultPath + 'atti.json',  JSON.stringify(temp.ATTI))
      console.log("Done " + requestId)
    }
    catch (e) {
      console.log('requestId ' + requestId + ' not present in pn-EcRichieste', e)
    }
  }
}

main();