const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { unmarshall } = require('@aws-sdk/util-dynamodb');

function appendJsonToFile(fileName, jsonData) {
  if (!fs.existsSync("files"))
    fs.mkdirSync("files", { recursive: true });
  fs.appendFileSync(fileName, JSON.stringify(jsonData) + "\n")
}

function _checkingParameters(args, values) {
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name>"
  //CHECKING PARAMETER
  args.forEach(el => {
    if (el.mandatory && !values.values[el.name]) {
      console.log("Param " + el.name + " is not defined")
      console.log(usage)
      process.exit(1)
    }
  })
  args.filter(el => {
    return el.subcommand.length > 0
  }).forEach(el => {
    if (values.values[el.name]) {
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
    { name: "latest", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, latest },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
      latest: {
        type: "boolean", short: "l", default: false
      },
    },
  });
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper(envName);
  const fileRows = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }).split('\n').filter(line => line.trim() !== '');
  let counter = {}
  let metadata = null
  let requestIdWithPcRetry = null
  for (let i = 0; i < fileRows.length; i++) {
    const requestId = fileRows[i].trim()
    let requestIdWithPcRetry = null
    if (latest) {
      let idx = 0;
      requestIdWithPcRetry = requestId + '.PCRETRY_' + idx;
      while (true) {
        const testRequestIdWithPcRetry = requestId + '.PCRETRY_' + idx;
        console.log(`Checking requestId: pn-cons-000~${testRequestIdWithPcRetry}`)
        let result = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", 'pn-cons-000~' + testRequestIdWithPcRetry)
        if (result.Items.length == 0) {
          appendJsonToFile("notfound.json", testRequestIdWithPcRetry)
          break
        }
        metadata = unmarshall(result.Items[0])
        idx = idx + 1
        requestIdWithPcRetry = testRequestIdWithPcRetry 
      }
    }
    else {
      requestIdWithPcRetry = fileRows[i].trim()
      let result = await awsClient._queryRequest("pn-EcRichiesteMetadati", "requestId", 'pn-cons-000~' + requestIdWithPcRetry)
      if (result.Items.length === 0) {
        appendJsonToFile("notfound.json", requestIdWithPcRetry)
        continue
      }
      metadata = unmarshall(result.Items[0])
    }
    if(metadata == null) {
      console.log(`RequestId ${requestIdWithPcRetry} not found in DynamoDB`)
      continue
    }
    !counter[metadata.statusRequest] ? counter[metadata.statusRequest] = 0 : null
    counter[metadata.statusRequest] = counter[metadata.statusRequest] + 1
    console.log(`${requestIdWithPcRetry} ${metadata.statusRequest}`)
    if (metadata.statusRequest === "error" || metadata.statusRequest === "internalError") {
      appendJsonToFile("error.json", metadata)
    }
    else if (metadata.statusRequest === "PN999" || metadata.statusRequest === "PN998") {
      appendJsonToFile("locked.json", metadata)
      //console.log(requestId + " locked by us")
    }
    else if (metadata.statusRequest != "booked" && metadata.statusRequest != "sent" && metadata.statusRequest != "retry") {
      appendJsonToFile("fromconsolidatore.json", metadata)
      //console.log(requestId + " received response from consolidatore")
    }
    else {
      appendJsonToFile("toconsolidatore.json", metadata)
      //console.log(requestId + " waiting for a response from consolidatore")
    }
  }
  appendJsonToFile("counter.json", counter)
}

main();