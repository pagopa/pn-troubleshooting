const { parseArgs } = require('util');
const fs = require('fs');
const path = require('path');

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --fileName <file-name> --categories <category1,category2,...> [--outputFolder <output-folder>]"
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
    { name: "fileName", mandatory: true, subcommand: [] },
    { name: "categories", mandatory: true, subcommand: [] },
    { name: "outputFolder", mandatory: false, subcommand: [] }
  ]
  const values = {
    values: { fileName, categories, outputFolder },
  } = parseArgs({
    options: {
      fileName: {
        type: "string", short: "f", default: undefined
      },
      categories: {
        type: "string", short: "c", default: undefined
      },
      outputFolder: {
        type: "string", short: "o", default: undefined
      },
    },
  });  
  _checkingParameters(args, values)
  const data = JSON.parse(fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' }));
  const searchTerms = categories.split(',')
  let results = {
    toreview: []
  }
  searchTerms.forEach(term => {
    results[term] = []
  });
  for (element of data) {
    let flag = false;
    searchTerms.forEach(term => {
      element.timeline.forEach(timeline => {
        if(timeline.timelineElementId.startsWith(term)) {
          if(!flag) {
            flag = true
            results[term].push(element)
          }
        }
      });  
    });
    if(!flag) {
      results.toreview.push(element)
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