const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { unmarshall } = require("@aws-sdk/util-dynamodb")

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

function _checkingEventsList(eventList) { 
  let map = {
    booked: false,
    sent: false,
    accepted: false,
    delivered: false,
  }
  for(const e of eventList ) {
    map[e.digProgrStatus.status] = true
  }
  for(const param in map) {
    if (!map[param]) {
      return false
    }
  }
  return true;
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
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
      },
    },
  });  

  _checkingParameters(args, values)
  const tableName = 'pn-EcRichiesteMetadati'
  const awsClient = new AwsClientsWrapper( envName );
  const data = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }));
  for(const element of data ) {
    const body = JSON.parse(element.Body)
    const input = body.xpagopaExtchCxId.concat("~" + body.requestIdx)
    var res = await awsClient._queryRequest(tableName, input);
    if(res.Items) {
      if(_checkingEventsList(unmarshall(res.Items[0]).eventsList)){
        console.log("PEC sent successfully for requestId: " + body.requestIdx)
      }
      else {
        console.log("RequestID to check for requestId: " + body.requestIdx)
      } 
    }
  }
}

main();