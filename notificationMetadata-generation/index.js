const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');
const { _parseCSV, sleep } = require("pn-common/libs/utils");
const { ApiClient } = require("./libs/api");
require('dotenv').config()

function prepareRequest(iun, next_status, timestamp) {
  const data = { 
    iun: iun,
    nextStatus: next_status,
    timestamp: timestamp
  }   
  return data;
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--dryrun]"
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
    { name: "dryrun", mandatory: false, subcommand: [] },
  ]
  const values = {
    values: { envName, fileName, dryrun },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      },
      dryrun: {
        type: "boolean", short: "d", default: false
      },
    },
  });  
  _checkingParameters(args, values)
  const data = await _parseCSV(fileName, ',')
  for(let i = 0; i < data.length; i++) {
    const element = data[i]
    if(element.accepted) {
      const body = prepareRequest(data[i].iun, "ACCEPTED", data[i].accepted_ts)
      if(!dryrun) {
        await sleep(1000)
        await ApiClient.requestToDelivery(body)
        console.log(`OK ACCEPTED for iun ${data[i].iun}`)
      } else {
        console.log('DRYRUN: iun with data ' + JSON.stringify(body))
      }  
      if(element.next_status!='ACCEPTED') {
        if(!dryrun) {
          const body = prepareRequest(data[i].iun, data[i].next_status, data[i].next_status_ts) 
          await sleep(1000)
          await ApiClient.requestToDelivery(body)
          console.log(`OK ${data[i].next_status} for iun ${data[i].iun}`)
        } else {
          console.log('DRYRUN: iun with data ' + JSON.stringify(body))
        }  
      }
    }
    console.log(`iun ${data[i].iun} completed!`)
  }
}

main();