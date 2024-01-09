const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --bucketName <bucketName> --fileName <fileName>"
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

function appendJsonToFile(fileName, jsonData){
  fs.appendFileSync(fileName, JSON.stringify(jsonData) + "\n")
}

async function removeDeletionMarker(awsClient, fileKey, bucketName){
    const version = await awsClient._getDeletionMarkerVersion(bucketName, fileKey)
    if(!version){
        throw new Error("Deletion marker not found for file " + fileKey)
    }

    await awsClient._removeDeletionMarker(fileKey, bucketName, version)
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "bucketName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, bucketName, fileName },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      bucketName: {
        type: "string", short: "b", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
    },
  });  
  
  _checkingParameters(args, values)

  const awsClient = new AwsClientsWrapper( envName );

  const fileContent = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  const rows = fileContent.split("\n")
  const outputFileName = 'files/deletion-marker.json'
  for(let i=0; i<rows.length; i++){
    const row = rows[i]
    const jsonRow = JSON.parse(row)
    try {
        await removeDeletionMarker(awsClient, jsonRow.file, bucketName)

        appendJsonToFile(outputFileName, {
            file: jsonRow.file,
            status: 'OK'
        })
    } catch(e){
        appendJsonToFile(outputFileName, {
            file: jsonRow.file,
            status: 'ERROR',
            error: e.message
        })
    }
  }
}

main();