const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --fileName <fileName> [--expiration <expiration> --tier <tier>]"
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
    { name: "expiration", mandatory: false, subcommand: [] },
    { name: "tier", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, expiration, tier},
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      expiration: {
        type: "string", short: "t", default: "30"
      },
      tier: {
        type: "string", short: "t", default: "Bulk"
      },
    },
  });  
  
  _checkingParameters(args, values)
  expiration = parseInt(expiration)
  const awsClient = new AwsClientsWrapper( envName );
  const listBuckets = await awsClient._getBucketLists();
  const bucketName = listBuckets.Buckets.filter((x) => x.Name.indexOf("safestorage")>0 && x.Name.indexOf("staging")<0)[0].Name;
  const keys = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  const value = keys.split("\n").filter( x => x != "" )
  for (element of value) {
    var splitted = element.split(",")
    const iun = splitted[0];
    const file = splitted[1];
    var res = await awsClient._retrieveFromGlacier(bucketName, file, expiration, tier)
    var statusCode = res['$metadata'].httpStatusCode
    if(statusCode == 409){
        console.log("IUN "+ iun +": Object restore is already in progress")
    }
    else if(statusCode == 202 || statusCode == 200){
        console.log("IUN "+ iun +": Retrieve completed")
    }
    else if(statusCode == 403){
        console.log("IUN "+ iun +": Object already available") 
    }
    else {
        console.log("IUN "+ iun +": An error not handled occurred")
        console.log("Exception: " + res)
    }
  }
}

main();
