const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs')


function _checkingParameters(args, values){
  const usage = "Usage: index.js --profile <profile> --queueUrl <queueUrl> --fileName <fileName>"
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
    { name: "profile", mandatory: true, subcommand: [] },
    { name: "queueUrl", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { profile, queueUrl, fileName },
  } = parseArgs({
    options: {
      profile: {
        type: "string", short: "p", default: undefined
      },
      queueUrl: {
        type: "string", short: "q", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( profile );
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  const formatFile = JSON.parse(data)
  eventsToRepublish = Object.values(formatFile);
  for (i = 0; i < eventsToRepublish.length; i++) {
    let json = eventsToRepublish[i]
    const res = await awsClient._sendEventToSQS(queueUrl, json);
    try { 
        if ('MD5OfMessageBody' in res) {
            console.log("Evento " + json.requestIdx + " inviato con successo!!!")
        }
        else {
            console.error("Invio di " + json.requestIdx + " fallito!!!")
        }
    } catch (error) {
        console.error("Invio di " + json.requestIdx + " fallito!!!")
    }
  }
}

main();