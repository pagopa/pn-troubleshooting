const { AwsClientsWrapper } = require("./libs/AwsClientWrapper");
const { parseArgs } = require('util');
const fs = require('fs');
const { yamlParse, yamlDump } = require('yaml-cfn');


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

function fileElaboration() {

}
async function _checkingTableDifferences(profile, fileName, tables){
  console.log("In '" + profile + "' sono state effettuate le seguenti modifiche:")
  const data = fs.readFileSync(fileName, { encoding: 'utf8', flag: 'r' });
  const parsedData = yamlParse(data);
  var values = []
  const regex = /\/([^\/]+)$/;
  const backupTablesTmp = parsedData.Resources.TagBasedBackupSelection.Properties.BackupSelection.Resources
  parsedData.Resources.TagBasedBackupSelection.Properties.BackupSelection.Resources = [] 
  console.log("Sono state aggiunte le seguenti tabelle:")
  tables.forEach(element => {
    tmp = {
      'Fn::Sub': 'arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/' + element
    }
    values.push(tmp)
    const hasData = backupTablesTmp.some(obj => obj['Fn::Sub'] == tmp['Fn::Sub'])
    if (!hasData) {
      console.log("- " + element)
    }
  });
  parsedData.Resources.TagBasedBackupSelection.Properties.BackupSelection.Resources = values
  console.log("Sono state rimosse le seguenti tabelle:")
  backupTablesTmp.forEach(elements => {
    const match = elements['Fn::Sub'].match(regex);
    const bTableName = match ? match[1] : null;
    if (!tables.includes(bTableName)) {
      console.log("- " + bTableName)
    }
  });
  console.log("----------")
  return yamlDump(parsedData);
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

  
  async function _writeInFile(result, filename ) {
    fs.mkdirSync("result", { recursive: true });
    fs.writeFileSync('result/' + filename, result)
  }

  _checkingParameters(args, values)
  const awsClient = new AwsClientsWrapper( envName );
  const tables = await awsClient._fetchDynamoDbTables();
  files.forEach(async fileName => {
    let account = 'core'
    if(fileName.indexOf('confinfo') > 0) {
      account = 'confinfo';
    }
    const res = await _checkingTableDifferences(account, folderPath + '/' + fileName, tables[account]);
    await _writeInFile(res, fileName)
  });
}

main();