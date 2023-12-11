const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { yamlParse } = require('yaml-cfn');


const files  = ['pn-backup_core_dynamotable.yaml', 'pn-backup_confinfo_dynamotable.yaml']

function _checkingParameters(args, values){
  const usage = "Usage: index.js --envName <envName> --folderPath <folderPath>"
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

function printElaboration(elements, flag) {  //true= added; false= removed
  if(elements.length == 0) {
    flag ? console.log("Non sono state aggiunte tabelle") : console.log("Non sono state rimosse tabelle")
  }
  else {
    flag ? console.log("Sono state aggiunte le seguenti tabelle:") : console.log("Sono state rimosse le seguenti tabelle:")
    elements.forEach(element => {
      console.log(element)
    });
  }
}

async function _checkingTableDifferences(profile, fileName, tables){
  if(idx = tables.indexOf('terraform-lock')) {
    tables.splice(idx)
  }
  console.log("In '" + profile + "' sono state effettuate le seguenti modifiche:")
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  const parsedData = yamlParse(data);
  const regex = /\/([^\/]+)$/;
  const backupTablesTmp = parsedData.Resources.TagBasedBackupSelection.Properties.BackupSelection.Resources
  parsedData.Resources.TagBasedBackupSelection.Properties.BackupSelection.Resources = [] 
  var result = []
  tables.forEach(element => {
    tmp = "- !Sub arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/" + element
    const hasData = backupTablesTmp.some(obj => {
      let splitted = obj['Fn::Sub'].split("/")
      return splitted[splitted.length-1] == element ? true : false
    }
    )
    if (!hasData) {
      result.push(tmp)
    }
  });
  printElaboration(result, true)
  result = []
  backupTablesTmp.forEach(element => {
    const match = element['Fn::Sub'].match(regex);
    const bTableName = match ? match[1] : null;
    if (!tables.includes(bTableName)) {
      result.push(bTableName)
    }
  });
  printElaboration(result, false)
}

async function main() {

  const args = [
    { name: "envName", mandatory: true, subcommand: [] },
    { name: "folderPath", mandatory: true, subcommand: [] },
  ]
  const values = {
    values: { envName, folderPath},
  } = parseArgs({
    options: {
      envName: {
        type: "string", short: "p", default: undefined
      },
      folderPath: {
        type: "string", short: "f", default: undefined
      },
    },
  });  

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const tables = await awsClient._fetchDynamoDbTables();
  files.forEach(async fileName => {
    let account = 'core'
    if(fileName.indexOf('confinfo') > 0) {
      account = 'confinfo';
    }
    await _checkingTableDifferences(account, folderPath + '/' + fileName, tables[account]);
  });
}

main();