const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --profile <profile> --queueUrl <queueUrl> --fileName <fileName> [--from [ec_events]]"
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
    { name: "from", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { profile, queueUrl, fileName, from},
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
      from: {
        type: "string", short: "f", default: "dump_sqs"
      },
    },
  });  

  async function handleEventToSQS(queueUrl, id, body, attributes){
    const res = await awsClient._sendEventToSQS(queueUrl, body, attributes);
    if ('MD5OfMessageBody' in res) {
      console.log("Event " + id + " sent successfully!!!")
    }
    else {
      failure.push(id)
      console.error("Event " + id + " failed!!!")
    }
  }
  
  async function _writeInFile(result, filename ) {
    fs.mkdirSync("failures", { recursive: true });
    fs.writeFileSync('failures/' + filename+'.json', JSON.stringify(result, null, 4), 'utf-8')
  }

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( profile );
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  const formatFile = JSON.parse(data)
  var failure = []
  // File obtained by dump_sqs script

  if(from == "dump_sqs") {
    const eventsToRepublish = formatFile;
    for (i = 0; i < eventsToRepublish.length; i++) {
      let json = eventsToRepublish[i]
      await handleEventToSQS(queueUrl, json.MessageId, json.Body, json.MessageAttributes)
    }
  }
  // File obtained by check_ec_events script
  else if (from == "ec_events") {
    const eventsToRepublish = Object.values(formatFile);
    for (i = 0; i < eventsToRepublish.length; i++) {
      let json = eventsToRepublish[i]
      await handleEventToSQS(queueUrl, json.requestIdx, json, undefined)
    }
  }
  else {
    console.log("--from=\"" + from + "\" not allowed")
  }
  
  
  if (failure.length > 0) {
    await _writeInFile(failure, "FailedMessages")
    console.log("Failed n° " + failure.length + "events")
  }
  else {
    console.log("No events Failed")
  }
  
}

main();