const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

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

function appendJsonToFile(fileName, jsonData){
  if(!fs.existsSync("results"))
    fs.mkdirSync("results", { recursive: true });
  fs.appendFileSync(fileName, JSON.stringify(jsonData) + "\n")
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
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n');
  for (iun of data) {
    if (iun === '')
      continue
    try {
      const attachments = (await awsClient._queryRequest("pn-Notifications", 'iun', iun, 'documents,recipients')).Items[0];
      const temp = {
        "iun": iun,
        "attachments": []
      }
      for(const doc of unmarshall(attachments).documents) {
        temp.attachments.push(doc.ref.key)
      }
      
      for(const recipient of unmarshall(attachments).recipients) {
        
        if(recipient.payments != null) {
          for(const payment of recipient.payments) {
            payment.pagoPaForm ? temp.attachments.push(payment.pagoPaForm.ref.key) : null
          }
        }
          
      }
      appendJsonToFile("results/attachments.json", temp)
    }
    catch (e) {
      console.log('IUN ' + iun + ' not present in pn-Notifications')
    }
  }
}

main();