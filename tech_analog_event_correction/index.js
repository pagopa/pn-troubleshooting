const { parseArgs } = require('util');
const fs = require('fs');
const { _parseCSV } = require('pn-common/libs/utils');
const { AwsClientsWrapper } = require("pn-common");

const CSV_DATA = ['preesito', 'inesito']

function _checkingParameters(args, values){
  const usage = "Usage: node index.js --envName <env-name> --fileName <file-name>"
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

function _prepareData(requestId, statusCode, statusDatetime) {
  const input = {}
  input.keys = {
    "pk": `META##${requestId}`,
    "sk": `META##${statusCode}`
  }
  input.values = {
        "statusDateTime": {
          codeAttr: '#s',
          codeValue: ':s',
          value: `${statusDatetime}`,
        }
      };
  return input
}

async function _updateEvent(awsClient, data) {
  const metas = []
  for(const c of CSV_DATA) {
    if(data[`${c}_corretto`].split('-').length > 1) {
      metas.push(_prepareData(data.requestid, data[`${c}_corretto`].split('-')[0], data[`statusdatetime_${c}`]))
    }
    else {
      console.log(`SKIPPED:{"requestId":"${data.requestid}", "${c}_corretto": "${data[`${c}_corretto`].split('-')[0]}", "statusdatetime_${c}":"${data[`statusdatetime_${c}`]}"}` )
    }
  }
  for (const m of metas) {
    try {
      await awsClient._updateItem('pn-PaperEvents', m.keys, m.values, 'SET', `attribute_exists(#s)`);
      console.log(`OK:${JSON.stringify(m)}` )
    } catch (error) {
      console.log(`ERROR:${JSON.stringify(m)}` )
    }
  }
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "fileName", mandatory: true, subcommand: [] }
  ]
  const values = {
    values: { envName, fileName },
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "e", default: undefined
      },
      fileName: {
        type: "string", short: "f", default: undefined
      }
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( 'core', envName );
  await awsClient._initDynamoDB()
  console.log('Reading from file...')

  const database = await _parseCSV(fileName, ';')
  for(const data of database){
    await _updateEvent(awsClient, data);    
  }
}

main()
.then(function(){
  console.log("ScriptEnd")
})