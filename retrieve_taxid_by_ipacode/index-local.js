const { parseArgs } = require('util');
const fs = require('fs');


function _checkingParameters(args, values){
  const usage = "Usage: index.js --fileNameIpa <fileNameIpa> --mappingIpa <mappingIpa>"
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
    { name: "mappingIpa", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { fileNameIpa, mappingIpa, },
  } = parseArgs({
    options: {
      fileNameIpa: {
        type: "string", short: "e", default: undefined
      },
      mappingIpa: {
        type: "string", short: "m", default: undefined
      },
    },
  });  
  
  _checkingParameters(args, values)
  const ipaCodeRows = fs.readFileSync(fileNameIpa, { encoding: 'utf8', flag: 'r' }).split('\n').splice(1)
  const mappingIpaRows = fs.readFileSync(mappingIpa, { encoding: 'utf8', flag: 'r' }).split('\n').splice(1)

  const ipaCodes = ipaCodeRows.map(row => row.split(',')[1]) 
  console.log('ipaCodes', ipaCodes)
  const ipaCodesMapping = {} 
  mappingIpaRows.forEach(row => {
    const rowSplit = row.split(',')
    ipaCodesMapping[rowSplit[0]] = rowSplit[1]
  })

  var result = [];
  for (ipa of ipaCodes) {
    const taxId = ipaCodesMapping[ipa]
    if(!taxId){
      console.log("Ipa code "+ipa+" not found in mapping file")
    } else {
      result.push({"paTaxId": taxId, "canSendMoreThan20Grams": true})
    }

  }
  _writeInFile(result, 'result' )
}

main();