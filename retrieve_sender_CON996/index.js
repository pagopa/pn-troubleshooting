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

async function _writeInFile(result, filename ) {
  fs.mkdirSync("result", { recursive: true });
  fs.writeFileSync('result/' + filename+'.json', JSON.stringify(result, null, 4), 'utf-8')
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
  const tableName = 'pn-Notifications'
  const awsClient = new AwsClientsWrapper( envName );
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  var results = {}
  for(const iun of data.split("\n") ) {
    var res = await awsClient._queryRequest(tableName, iun);
    if(res.Items) {
      let notification = unmarshall(res.Items[0])
      if(!(notification.senderPaId in results)) {
        results[notification.senderPaId] = []
      }
      results[notification.senderPaId].push({
        iun: iun,
        denomination: notification.senderDenomination
      })
      console.log("IUN OK: " + iun)      
    }
    else {
      console.log("IUN NOT FOUND: " + iun)
    }
  }
  const denominations = []
  for(const k of Object.keys(results)) {
    const obj = {
      denomination: results[k][0].denomination,
      senderPaId: k,
      iuns: results[k].map(i => {
        return i.iun
      })
    }
    denominations.push(obj)
  }
  await _writeInFile(denominations, "denomination")

}

main();