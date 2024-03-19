const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');

function _isAnalogCategory(category) {
  let categoryAllowed = ["SEND_ANALOG", "PREPARE_ANALOG"]
  return categoryAllowed.some((tmp)=> {
    return category.startsWith(tmp)
  })
}

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name> [--outputFolder <output-folder>]"
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
  const str = result.map(el => {
    return JSON.stringify(el, null)
  }).join('\n')
  fs.writeFileSync(filename+'.json', str, 'utf-8')
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "outputFolder", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName, outputFolder },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "p", default: undefined
      },
      fileName: {
        type: "string", short: "t", default: undefined
      },
      outputFolder: {
        type: "string", short: "t", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const data = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }));
  let results = {
    analog: [],
    cancelled: [],
    toreview: []
  }
  for (element of data) {
    const latestTimelineEvent = element.timeline[element.timeline.length-1]
    if(_isAnalogCategory(latestTimelineEvent.category)){
      const timelineElementId = latestTimelineEvent.timelineElementId;
      results.analog.push({
        iun: element.iun,
        requestId: timelineElementId.indexOf("IDX") > 0 ? timelineElementId.split(".IDX")[0] : timelineElementId,
        timeline: latestTimelineEvent
      })
    }
    else if (latestTimelineEvent.category.startsWith("NOTIFICATION_CANCELLED")){
      results.cancelled.push({
        iun: element.iun,
        requestId: null,
        timeline: latestTimelineEvent
      })
    }
    else {
      results.toreview.push({
        iun: element.iun,
        timeline: latestTimelineEvent
      })
    }
  }
  let resultPath = outputFolder ? path.join(__dirname, "/results/" + outputFolder + "/" + new Date().toISOString()) : path.join(__dirname, "/results/" + new Date().toISOString())
  console.log("RESULT PATH: " + resultPath)
  fs.mkdirSync(resultPath, { recursive: true })
  Object.keys(results).forEach(async element => {
    if(results[element].length > 0) {
      console.log("WRITING " + resultPath + "/" + element)
      await _writeInFile(results[element], resultPath + "/" + element)
    }
  });
  //await _writeInFile(results, resultPath + "cancelled_"+new Date().toISOString())
  console.log("End Execution")
}

main();