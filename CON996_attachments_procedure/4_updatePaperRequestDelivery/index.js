const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require("@aws-sdk/util-dynamodb");

function _checkingParameters(args, values){
const usage = "Usage: index.js --envName <env-name> --attachmentsFile <attachments-file> --dataFile <data-file> --cacheFile <cache-file> [--dryrun]"
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

function createJsonToFile(fileName, data){
  fs.writeFileSync(fileName, JSON.stringify(data, null, 2))
}

function prepareAttachmentFile(attachmentsFile) {
  let dataFile = new Map()
  const attachmentsData = fs.readFileSync(attachmentsFile, { encoding: 'utf8', flag: 'r' }).split("\n");
  attachmentsData.forEach(element => {
    if(element!=""){
      element = JSON.parse(element)
      if(!dataFile.has(element.requestId)){
        dataFile.set(element.requestId, element.attachments)
      }
      else {
        console.log("problem during data file prepare. Element duplicated " + element.requestId)
      }
    }
  });
  return dataFile;
}

function prepareDataFile(fileName) {
  const dataFile = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }))
  return dataFile;
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "attachmentsFile", mandatory: true, subcommand: [] },
    { name: "dataFile", mandatory: true, subcommand: [] },
    { name: "cacheFile", mandatory: false, subcommand: [] },
    { name: "dryrun", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, attachmentsFile, dataFile, cacheFile, dryrun  },
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
      cacheFile: {
        type: "string", short: "c", default: undefined
      },
      dryrun: {
        type: "boolean", short: "w", default: false
      }
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const attachmentsFileMap = prepareAttachmentFile(attachmentsFile)
  const dataFileMap = prepareDataFile(dataFile)
  let output = {}
  if(cacheFile) {
    output = prepareDataFile(cacheFile)
  }
  
  for (const requestId of attachmentsFileMap.keys()) {
    let toModify = false;
    let result = unmarshall((await awsClient._queryRequest("pn-PaperRequestDelivery", "requestId", requestId)).Items[0])
    const attachments = result.attachments;
    for(let i = 0; i < attachments.length; i++) {
      const tmpFileKey = attachments[i].fileKey.replace("safestorage://", "").split('?')[0]
      if (tmpFileKey in dataFileMap) {
        toModify = true;
        output[dataFileMap[tmpFileKey]["fileKey"]] = {
            date: attachments[i]["date"],
            checksum: attachments[i]["checksum"],
            url: attachments[i]["url"],
            fileKey: attachments[i]["fileKey"]
        }
        createJsonToFile("output.json", output)
        attachments[i]["date"] = dataFileMap[tmpFileKey]["date"]
        attachments[i]["checksum"] = dataFileMap[tmpFileKey]["checksum"]
        attachments[i]["url"] = dataFileMap[tmpFileKey]["url"]
        dataFileMap[tmpFileKey]["fileKey"].startsWith("safestorage://") ? attachments[i]["fileKey"] = dataFileMap[tmpFileKey]["fileKey"] : attachments[i]["fileKey"] = "safestorage://" + dataFileMap[tmpFileKey]["fileKey"]  //verificare se fabrizio ci piazza safestorage://
      }
    }
    if(toModify) {
      if(!dryrun) {
        await awsClient._updateItem("pn-PaperRequestDelivery", requestId, attachments)
        console.log("done " + requestId)
      } else {
        console.log("dryrun: done " + requestId)
      }
    }
    else {
      console.log("skipping " + requestId)
    }
  } 
}

main();