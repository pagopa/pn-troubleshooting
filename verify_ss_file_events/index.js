const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');

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

async function _writeInFile(result) {
  fs.mkdirSync("result", { recursive: true });
  const dateIsoString = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  fs.writeFileSync('result/result.json', JSON.stringify(result, null, 4), 'utf-8')
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
  const tableName = 'pn-SsDocumenti'
  const filesKey = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  const listBuckets = await awsClient._getBucketLists();
  const usefullBucket = listBuckets.Buckets.filter((x) => x.Name.indexOf("safestorage")>0);
  for(file of filesKey) {
    var temp = {}
    for(bucket of usefullBucket) {
      try {
        res = await awsClient._getHeadObject(bucket.Name, file)
        temp[bucket.Name] = res['$metadata'].httpStatusCode
      }
      catch (e) {
        temp[bucket.Name] = e['$metadata'].httpStatusCode
      }
    }
    Object.keys(temp).forEach(b => {
      if(((b.indexOf('staging') > 0 && temp[b] == 404 ) || temp[b] == 200)) {
        return;
      }
      else {
        console.log("Error S3! " + file)
      }
    })
    try {
      const d = await awsClient._queryRequest(tableName, 'documentKey', file, 'documentLogicalState, documentState')
      if(d.Items[0].documentLogicalState.S == "SAVED" && d.Items[0].documentState.S == "available") {
        console.log(file + " handled correctly!")
      }
      else {
        console.log("Error Dynamo! " + file)
      }
    }
    catch (e) {
      console.log("Error Dynamo! " + e)
    }
  }
}

main();
