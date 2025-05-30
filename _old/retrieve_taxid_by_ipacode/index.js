const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --fileNameIpa <fileNameIpa> --fileNameDump <fileNameDump>''"
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
  fs.writeFileSync('result/' + filename+'.json', JSON.stringify(result), 'utf-8')
}

async function main() {

  const args = [
    { name: "fileNameIpa", mandatory: true, subcommand: [] },
    { name: "fileNameDump", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { fileNameIpa, fileNameDump },
  } = parseArgs({
    options: {
      fileNameIpa: {
        type: "string", short: "e", default: undefined
      },
      fileNameDump: {
        type: "string", short: "b", default: undefined
      }
    },
  });  
  
  _checkingParameters(args, values)
  const ipaCodes = fs.readFileSync(fileNameIpa, { encoding: 'utf8', flag: 'r' }).split('\n');
  const dumpInstitutions = JSON.parse(fs.readFileSync(fileNameDump, { encoding: 'utf8', flag: 'r' }))
  var result = [];
  for (ipa of ipaCodes) {
    for (element of dumpInstitutions) {
      if(element.ipaCode.S == ipa) {
        result.push({"paTaxId": element.taxCode.S,"canSendMoreThan20Grams": true})
      }
    }
  }
  console.log("Trovati n° " + result.length + "/" + ipaCodes.length + " della lista fornita")
  console.log(result)
  _writeInFile(result, 'result' )
}

main();