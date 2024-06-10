const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require("@aws-sdk/util-dynamodb");

function _checkingParameters(args, values){
const usage = "Usage: index.js --envName <env-name> --attachmentsFile <attachments-file> --dataFile <data-file>"
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

function prepareDataFile(fileName) {
  const dataFile = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }))
  return dataFile;
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "attachmentsFile", mandatory: true, subcommand: [] },
    { name: "dataFile", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { envName, attachmentsFile, dataFile },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      attachmentsFile: {
        type: "string", short: "a", default: undefined
      },
      dataFile: {
        type: "string", short: "d", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const attachmentsFileMap = prepareAttachmentFile(attachmentsFile)
  const dataFileList = prepareDataFile(dataFile)
  for (const requestId in attachmentsFileMap) {
    let result = unmarshall((await awsClient._queryRequest("pn-PaperRequestDelivery", "requestId", requestId)).Items[0])
    const attachments = result.attachments;
    for(let i = 0; i < attachments.length; i++) {
      const tmpFileKey = attachments[i].fileKey.replace("safestorage://", "")
      if (dataFileList.has(tmpFileKey)) {
        attachments[i]["date"] = dataFileList[tmpFileKey]["date"]
        attachments[i]["checksum"] = dataFileList[tmpFileKey]["checksum"]
        attachments[i]["url"] = dataFileList[tmpFileKey]["url"]
        dataFileList[tmpFileKey]["fileKey"].startsWith("safestorage://") ? attachments[i]["fileKey"] = dataFileList[tmpFileKey]["fileKey"] : attachments[i]["fileKey"] = "safestorage://" + dataFileList[tmpFileKey]["fileKey"]  //verificare se fabrizio ci piazza safestorage://
      }
    }
    await awsClient._updateItem("pn-PaperRequestDelivery", requestId, attachments)
  } 
}

main();