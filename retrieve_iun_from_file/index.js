const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');

function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --fileName <fileName> --timing"
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
    { name: "timing", mandatory: false, subcommand: [] },
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
      timing: {
        type: "boolean", short: "f", default: false
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  var result = {}
  for(const element of data ) {
    var filekey;
    var time;
    if(timing) {
      var temp = element.split('|')
      filekey = temp[0]
      time = temp[1]
    }
    else {
      filekey = element;
    }
    
    var iun = (await awsClient._queryRequest("pn-DocumentCreationRequestTable", 'key', "safestorage://" + filekey, 'iun')).Items[0].iun.S;
    try {
      var senderDenomination = (await awsClient._queryRequest("pn-Notifications", 'iun', iun, 'senderDenomination')).Items[0].senderDenomination.S;
    }
    catch (e) {
      console.log('IUN ' + iun + ' not present in pn-Notifications')
    }
    if(!result.hasOwnProperty(senderDenomination)) {
      result[senderDenomination] = {}
    }
    if(!result[senderDenomination].hasOwnProperty(iun)) {
      timing ? result[senderDenomination][iun+"|"+time] = [] : result[senderDenomination][iun] = []
    }
    timing ? result[senderDenomination][iun+"|"+time].push(filekey) : result[senderDenomination][iun].push(filekey)

    console.log("filekey= " + element + " IUN= " + iun  + " SENDER= " + senderDenomination )
  }
  console.log(result)
  await _writeInFile(result)
}

main();